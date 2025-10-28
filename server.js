import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import path from "path";
import { GameState, RoomState } from "./lib/GameState.js";
import { Room } from "./lib/Room.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const PORT = 3000;

app.use(express.json());
app.use(express.static("public"));
app.use("/resources", express.static("resources"));
app.use("/lib", express.static("lib"));

// 房间管理
const rooms = new Map();

// Socket.IO 连接处理
io.on("connection", (socket) => {
  console.log("玩家连接:", socket.id);

  // 加入房间
  socket.on("joinRoom", (data) => {
    try {
      const { roomId = "default", playerName = "玩家" } = data;

      // 创建或获取房间
      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Room(roomId));
      }

      const room = rooms.get(roomId);
      
      // 添加玩家
      const player = room.addPlayer(socket.id, playerName);
      
      socket.join(roomId);
      socket.roomId = roomId;

      console.log(
        `玩家 ${playerName}(${socket.id}) 加入房间 ${roomId}, 颜色: ${player.color}, 房主: ${player.isHost}`
      );

      // 广播房间更新
      io.to(roomId).emit("roomUpdate", room.getRoomInfo());
    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });

  // 玩家准备
  socket.on("playerReady", () => {
    try {
      const room = rooms.get(socket.roomId);
      if (!room) {
        throw new Error("房间不存在");
      }

      const readyState = room.togglePlayerReady(socket.id);
      const playerName = room.getPlayerName(socket.id);

      console.log(`玩家 ${playerName} 准备状态: ${readyState}`);

      // 广播房间更新
      io.to(socket.roomId).emit("roomUpdate", room.getRoomInfo());
    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });

  // 开始游戏（仅房主）
  socket.on("startGame", () => {
    try {
      const room = rooms.get(socket.roomId);
      if (!room) {
        throw new Error("房间不存在");
      }

      // 检查是否是房主
      if (!room.isHost(socket.id)) {
        throw new Error("只有房主可以开始游戏");
      }

      // 开始游戏
      room.startGame();

      io.to(socket.roomId).emit("gameStart", {
        success: true,
        message: "游戏开始",
        gameState: room.gameInstance.getGameState(),
        state: GameState.ROLLING,
      });
    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });

  // 掷骰子
  socket.on("rollDice", () => {
    try {
      const room = rooms.get(socket.roomId);
      if (!room || !room.gameInstance) {
        throw new Error("游戏未开始");
      }

      if (room.state !== RoomState.PLAYING) {
        throw new Error("游戏未开始");
      }

      // 判断是否是当前玩家的回合
      if (!room.isCurrentPlayer(socket.id)) {
        const currentPlayer = room.getCurrentPlayer();
        const myPlayer = room.getPlayer(socket.id);
        throw new Error(
          `不是你的回合！当前回合：${currentPlayer.name}(${currentPlayer.color})，你是：${myPlayer.name}(${myPlayer.color})`
        );
      }

      const diceRoll = Math.floor(Math.random() * 6) + 1;
      room.lastDiceRoll = diceRoll;

      const currentPlayer = room.gameInstance.currentSide;
      const needRollback = currentPlayer.test(diceRoll);

      // 三个6，回退所有棋子
      if (needRollback) {
        currentPlayer.pieces.forEach((piece) => {
          if (!piece.win && piece.isReady) {
            piece.reset();
          }
        });

        const currentPlayerState = room.gameInstance.getGameState();
        room.gameInstance.nextTurn();
        room.canRollAgain = false;

        // 获取下一个玩家信息
        const nextPlayer = room.getCurrentPlayer();

        io.to(socket.roomId).emit("rollResult", {
          success: true,
          diceRoll: diceRoll,
          message: `三个6!所有棋子退回基地，切换到 ${nextPlayer.name}（${nextPlayer.color}）`,
          rollback: true,
          gameState: currentPlayerState,
          nextPlayer: room.gameInstance.getGameState(),
          state: GameState.ROLLING,
          canRollAgain: false,
          switchPlayer: true,
        });
        return;
      }

      // 查找可移动的棋子
      const movablePieces = currentPlayer.pieces
        .map((piece, index) => ({ piece, index }))
        .filter(({ piece }) => {
          if (piece.win) return false;
          if (!piece.isReady && (diceRoll === 5 || diceRoll === 6)) return true;
          if (piece.isReady) return true;
          return false;
        });

      // 没有可移动的棋子，自动切换
      if (movablePieces.length === 0) {
        const currentPlayerState = room.gameInstance.getGameState();
        room.gameInstance.nextTurn();
        const nextPlayerState = room.gameInstance.getGameState();
        room.canRollAgain = false;

        // 获取下一个玩家信息
        const nextPlayer = room.getCurrentPlayer();

        io.to(socket.roomId).emit("rollResult", {
          success: true,
          diceRoll: diceRoll,
          message: `没有可移动的棋子，切换到 ${nextPlayer.name}（${nextPlayer.color}）`,
          gameState: currentPlayerState,
          nextPlayer: nextPlayerState,
          state: GameState.ROLLING,
          canRollAgain: false,
          switchPlayer: true,
        });
        return;
      }

      // 有可移动的棋子
      io.to(socket.roomId).emit("rollResult", {
        success: true,
        diceRoll: diceRoll,
        message: "请选择要移动的棋子",
        movablePieces: movablePieces.map(({ index }) => index),
        gameState: room.gameInstance.getGameState(),
        state: GameState.SELECTING,
        canRollAgain: false,
        switchPlayer: false,
      });
    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });

  // 移动棋子
  socket.on("movePiece", (data) => {
    try {
      const room = rooms.get(socket.roomId);
      if (!room || !room.gameInstance) {
        throw new Error("游戏未开始");
      }

      // 判断是否是当前玩家的回合
      if (!room.isCurrentPlayer(socket.id)) {
        const currentPlayer = room.getCurrentPlayer();
        const myPlayer = room.getPlayer(socket.id);
        throw new Error(
          `不是你的回合！当前回合：${currentPlayer.name}(${currentPlayer.color})，你是：${myPlayer.name}(${myPlayer.color})`
        );
      }

      const { pieceIndex } = data;
      const currentPlayer = room.gameInstance.currentSide;
      const piece = currentPlayer.pieces[pieceIndex];

      if (!piece) {
        throw new Error("无效的棋子索引");
      }

      if (piece.win) {
        throw new Error("该棋子已获胜");
      }

      let moveEvents = [];
      let animationData = [];
      const pieceNumber = pieceIndex + 1;

      // 棋子出发
      if (!piece.isReady && (room.lastDiceRoll === 5 || room.lastDiceRoll === 6)) {
        const fromPos = { ...piece.position };
        piece.ready();
        const toPos = { ...piece.position };

        moveEvents.push(`${pieceNumber}号棋子出发`);
        animationData.push({
          type: "MOVE",
          pieceId: piece.id,
          from: fromPos,
          to: toPos,
          path: [fromPos, toPos],
        });
      } 
      // 棋子移动
      else if (piece.isReady) {
        const fromPos = { ...piece.position };
        const startRoadIndex = piece.road.index;

        const allPiecesBefore = room.gameInstance.getAllPieces().map((p) => ({
          id: p.id,
          color: p.color,
          positionId: p.position.id,
          isReady: p.isReady,
          win: p.win,
        }));

        const path = [{ ...fromPos }];
        for (let i = 1; i <= room.lastDiceRoll; i++) {
          const nextIndex = startRoadIndex + i;
          if (nextIndex < piece.road.list.length) {
            const pos = piece.road.list[nextIndex];
            path.push({ id: pos.id, left: pos.left, top: pos.top });
          }
        }

        const capturedEvents = [];
        const customRule = {
          win: (piece, color) => {},
          tipsJump: () => capturedEvents.push("跳跃"),
          tipsFly: () => capturedEvents.push("飞行"),
          attack: (hitStack) => {
            if (hitStack) {
              capturedEvents.push("撞敌方叠子(双方返回)");
            } else {
              capturedEvents.push("击退敌方");
            }
          },
        };

        piece.jumpStep(
          room.lastDiceRoll,
          room.gameInstance.getAllPieces(),
          customRule
        );

        const toPos = { ...piece.position };

        const piecesOnFinalSpot = room.gameInstance
          .getAllPieces()
          .filter(
            (p) =>
              p.position.id === piece.position.id &&
              p.color === piece.color &&
              !p.win
          );
        if (piecesOnFinalSpot.length >= 2) {
          capturedEvents.push("形成叠子");
        }

        if (path.length > 0 && path[path.length - 1].id !== toPos.id) {
          path.push({ ...toPos });
        }

        moveEvents.push(`移动${pieceNumber}号棋子`);
        capturedEvents.forEach((event) => moveEvents.push(event));

        if (piece.win) {
          moveEvents.push(`${pieceNumber}号棋子到达终点`);
        }

        let animType = "MOVE";
        if (capturedEvents.includes("飞行")) {
          animType = "FLY";
        } else if (capturedEvents.includes("跳跃")) {
          animType = "JUMP";
        }

        animationData.push({
          type: animType,
          pieceId: piece.id,
          from: fromPos,
          to: toPos,
          path: path,
        });

        const allPiecesAfter = room.gameInstance.getAllPieces();
        allPiecesBefore.forEach((beforePiece) => {
          const afterPiece = allPiecesAfter.find((p) => p.id === beforePiece.id);
          if (
            beforePiece.isReady &&
            !afterPiece.isReady &&
            beforePiece.id !== piece.id
          ) {
            const kickedFromPos = allPiecesAfter.find(
              (p) => p.id === beforePiece.id
            ).position;
            const kickedToPos = afterPiece.position;

            moveEvents.push(`击飞${beforePiece.color}棋子`);
            animationData.push({
              type: "KICKBACK",
              pieceId: beforePiece.id,
              from: {
                id: beforePiece.positionId,
                left: kickedFromPos.left,
                top: kickedFromPos.top,
              },
              to: kickedToPos,
              path: [
                {
                  id: beforePiece.positionId,
                  left: kickedFromPos.left,
                  top: kickedFromPos.top,
                },
                kickedToPos,
              ],
            });
          }
        });
      } else {
        throw new Error("该棋子无法移动");
      }

      currentPlayer.checkWinCondition();

      const currentPlayerState = room.gameInstance.getGameState();
      room.canRollAgain = room.lastDiceRoll === 6;
      
      let nextPlayerState = null;
      if (!room.canRollAgain) {
        room.gameInstance.nextTurn();
        nextPlayerState = room.gameInstance.getGameState();
      }

      io.to(socket.roomId).emit("moveResult", {
        success: true,
        message: "棋子移动成功",
        moveEvents: moveEvents,
        animationData: animationData,
        movedPieceIndex: pieceNumber,
        diceRoll: room.lastDiceRoll,
        gameState: currentPlayerState,
        nextPlayer: nextPlayerState,
        state: GameState.ROLLING,
        canRollAgain: room.canRollAgain,
        switchPlayer: !room.canRollAgain,
      });
    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });

  // 重置游戏
  socket.on("resetGame", () => {
    try {
      const room = rooms.get(socket.roomId);
      if (!room) {
        throw new Error("房间不存在");
      }

      room.resetGame();

      io.to(socket.roomId).emit("gameReset", {
        success: true,
        message: "游戏已重置",
      });
    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });

  // 断开连接
  socket.on("disconnect", () => {
    console.log("玩家断开:", socket.id);

    if (socket.roomId) {
      const room = rooms.get(socket.roomId);
      if (room) {
        const removedPlayer = room.removePlayer(socket.id);

        if (room.isEmpty()) {
          rooms.delete(socket.roomId);
          console.log(`房间 ${socket.roomId} 已删除`);
        } else if (removedPlayer) {
          io.to(socket.roomId).emit("playerLeft", {
            players: room.players,
            leftPlayerName: removedPlayer.name,
            message: `玩家 ${removedPlayer.name} 离开了房间`,
          });
          
          // 如果游戏正在进行，广播房间更新
          if (room.state === RoomState.PLAYING) {
            io.to(socket.roomId).emit("roomUpdate", room.getRoomInfo());
          }
        }
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`飞行棋游戏服务器运行在 http://localhost:${PORT}`);
});
