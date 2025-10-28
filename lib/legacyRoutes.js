import { Game } from "./Chess.js";
import { GameState } from "./GameState.js";

// 全局游戏实例（仅用于单人模式兼容）
let gameInstance = null;
let gameState = GameState.WAITING;
let lastDiceRoll = 0;
let canRollAgain = false;

// 保留旧的 REST API(可选，用于兼容)
/**
 * @param {Express} app - Express 应用实例
 */
export function registerLegacyRoutes(app) {
  // 创建游戏
  app.post("/api/game/create", (req, res) => {
    const { players } = req.body;

    if (!players || players.length < 2 || players.length > 4) {
      return res.status(400).json({ error: "玩家数量必须在2-4人之间" });
    }

    const colors = ["blue", "yellow", "green", "red"];
    const gamePlayers = players.map((name, index) => ({
      id: name,
      color: colors[index],
    }));

    gameInstance = new Game(gamePlayers);
    gameState = GameState.ROLLING;
    lastDiceRoll = 0;
    canRollAgain = false;

    res.json({
      success: true,
      message: "游戏创建成功",
      gameState: gameInstance.getGameState(),
      state: gameState,
    });
  });

  // 获取游戏状态
  app.get("/api/game/state", (req, res) => {
    if (!gameInstance) {
      return res.status(404).json({ error: "游戏未创建" });
    }

    res.json({
      gameState: gameInstance.getGameState(),
      state: gameState,
      lastDiceRoll,
      canRollAgain,
    });
  });

  // 掷骰子
  app.post("/api/game/roll", (req, res) => {
    if (!gameInstance) {
      return res.status(404).json({ error: "游戏未创建" });
    }

    if (gameState !== GameState.ROLLING) {
      return res.status(400).json({ error: "现在不能掷骰子" });
    }

    lastDiceRoll = Math.floor(Math.random() * 6) + 1;

    const currentSide = gameInstance.currentSide;

    const needRollback = currentSide.test(lastDiceRoll);

    if (needRollback) {
      currentSide.pieces.forEach((piece) => {
        if (!piece.win && piece.isReady) {
          piece.reset();
        }
      });

      const currentPlayerState = gameInstance.getGameState();

      gameInstance.nextTurn();
      gameState = GameState.ROLLING;
      canRollAgain = false;

      return res.json({
        success: true,
        diceRoll: lastDiceRoll,
        message: "三个6!所有棋子退回基地",
        rollback: true,
        gameState: currentPlayerState,
        nextPlayer: gameInstance.getGameState(),
        state: gameState,
        canRollAgain,
        switchPlayer: true,
      });
    }

    const movablePieces = currentSide.pieces
      .map((piece, index) => ({ piece, index }))
      .filter(({ piece }) => {
        if (piece.win) return false;
        if (!piece.isReady && (lastDiceRoll === 5 || lastDiceRoll === 6))
          return true;
        if (piece.isReady) return true;
        return false;
      });

    if (movablePieces.length === 0) {
      const currentPlayerState = gameInstance.getGameState();

      gameInstance.nextTurn();
      const nextPlayerState = gameInstance.getGameState();
      gameState = GameState.ROLLING;
      canRollAgain = false;

      const response = {
        success: true,
        diceRoll: lastDiceRoll,
        message: "没有可移动的棋子",
        gameState: currentPlayerState,
        nextPlayer: nextPlayerState,
        state: gameState,
        canRollAgain,
        switchPlayer: true,
      };

      return res.json(response);
    }

    gameState = GameState.SELECTING;

    res.json({
      success: true,
      diceRoll: lastDiceRoll,
      message: "请选择要移动的棋子",
      movablePieces: movablePieces.map(({ index }) => index),
      gameState: gameInstance.getGameState(),
      state: gameState,
      canRollAgain: false,
      switchPlayer: false,
    });
  });

  // 移动棋子
  app.post("/api/game/move", (req, res) => {
    if (!gameInstance) {
      return res.status(404).json({ error: "游戏未创建" });
    }

    if (gameState !== GameState.SELECTING) {
      return res.status(400).json({ error: "现在不能选择棋子" });
    }

    const { pieceIndex } = req.body;
    const currentSide = gameInstance.currentSide;
    const piece = currentSide.pieces[pieceIndex];

    if (!piece) {
      return res.status(400).json({ error: "无效的棋子索引" });
    }

    if (piece.win) {
      return res.status(400).json({ error: "该棋子已获胜" });
    }

    let moveEvents = [];
    let animationData = [];
    const pieceNumber = pieceIndex + 1;

    if (!piece.isReady && (lastDiceRoll === 5 || lastDiceRoll === 6)) {
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
    } else if (piece.isReady) {
      const fromPos = { ...piece.position };
      const startRoadIndex = piece.road.index;

      const allPiecesBefore = gameInstance.getAllPieces().map((p) => ({
        id: p.id,
        color: p.color,
        positionId: p.position.id,
        isReady: p.isReady,
        win: p.win,
      }));

      const path = [{ ...fromPos }];
      for (let i = 1; i <= lastDiceRoll; i++) {
        const nextIndex = startRoadIndex + i;
        if (nextIndex < piece.road.list.length) {
          const pos = piece.road.list[nextIndex];
          path.push({ id: pos.id, left: pos.left, top: pos.top });
        }
      }

      const capturedEvents = [];
      const customRule = {
        win: (piece, color) => {},
        tipsJump: () => {
          capturedEvents.push("跳跃");
        },
        tipsFly: () => {
          capturedEvents.push("飞行");
        },
        attack: (hitStack) => {
          if (hitStack) {
            capturedEvents.push("撞敌方叠子(双方返回)");
          } else {
            capturedEvents.push("击退敌方");
          }
        },
      };

      piece.jumpStep(lastDiceRoll, gameInstance.getAllPieces(), customRule);

      const toPos = { ...piece.position };

      const piecesOnFinalSpot = gameInstance
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

      capturedEvents.forEach((event) => {
        moveEvents.push(event);
      });

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

      const allPiecesAfter = gameInstance.getAllPieces();
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
      return res.status(400).json({ error: "该棋子无法移动" });
    }

    currentSide.checkWinCondition();

    const currentPlayerState = gameInstance.getGameState();

    canRollAgain = lastDiceRoll === 6;
    let nextPlayerState = null;
    if (!canRollAgain) {
      gameInstance.nextTurn();
      nextPlayerState = gameInstance.getGameState();
    }
    gameState = GameState.ROLLING;

    res.json({
      success: true,
      message: "棋子移动成功",
      moveEvents: moveEvents,
      animationData: animationData,
      movedPieceIndex: pieceNumber,
      diceRoll: lastDiceRoll,
      gameState: currentPlayerState,
      nextPlayer: nextPlayerState,
      state: gameState,
      canRollAgain,
      switchPlayer: !canRollAgain,
    });
  });

  // 重置游戏
  app.post("/api/game/reset", (req, res) => {
    gameInstance = null;
    gameState = GameState.WAITING;
    lastDiceRoll = 0;
    canRollAgain = false;

    res.json({
      success: true,
      message: "游戏已重置",
    });
  });
}
