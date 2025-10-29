// ============ Socket.IO 连接 ============
const socket = io();
let myPlayerColor = null;
let myPlayerName = null;
let currentRoomId = null;

let gameState = null;
let players = [];
let positions = [];
let backgroundImg = null;
let pieceImages = {};
let diceImages = {};

const colorMap = {
  red: "#FF0000",
  blue: "#0000FF",
  green: "#00FF00",
  yellow: "#FFFF00",
};

const pieceNumberColorMap = {
  red: "#8B0000",
  blue: "#00008B",
  green: "#006400",
  yellow: "#B8860B",
};

const setupPanel = document.getElementById("setup-panel");
const gamePanel = document.getElementById("game-panel");
const joinRoomBtn = document.getElementById("join-room-btn");
const startGameBtn = document.getElementById("start-game-btn");
const rollDiceBtn = document.getElementById("roll-dice-btn");
const resetGameBtn = document.getElementById("reset-game-btn");
const roomIdInput = document.getElementById("room-id");
const playerNameInput = document.getElementById("player-name");
const waitingRoom = document.getElementById("waiting-room");
const roomPlayersList = document.getElementById("room-players-list");
const gameMessage = document.getElementById("game-message");
const lastTurnEvents = document.getElementById("last-turn-events");
const currentPlayerName = document.getElementById("current-player-name");
const currentPlayerColor = document.getElementById("current-player-color");
const lastPlayerName = document.getElementById("last-player-name");
const lastPlayerColor = document.getElementById("last-player-color");
const canvas = document.getElementById("game-board");
const ctx = canvas.getContext("2d");

let diceCanvas = null;
let diceCtx = null;
let lastDiceCanvas = null;
let lastDiceCtx = null;

let currentTurnInfo = {
  playerName: "",
  playerColor: "",
  diceRoll: 0,
};

let lastTurnInfo = {
  playerName: "",
  playerColor: "",
  diceRoll: 0,
  message: "",
};

function initDiceCanvas() {
  diceCanvas = document.getElementById("dice-canvas");
  if (diceCanvas) {
    diceCtx = diceCanvas.getContext("2d");
    console.log(
      "骰子Canvas已初始化:",
      diceCanvas.width,
      "x",
      diceCanvas.height
    );

    drawDice(0);
  } else {
    console.error("无法找到骰子Canvas元素");
  }

  lastDiceCanvas = document.getElementById("last-dice-canvas");
  if (lastDiceCanvas) {
    lastDiceCtx = lastDiceCanvas.getContext("2d");
    console.log(
      "上一轮骰子Canvas已初始化:",
      lastDiceCanvas.width,
      "x",
      lastDiceCanvas.height
    );

    drawLastDice(0);
  } else {
    console.error("无法找到上一轮骰子Canvas元素");
  }
}

const BOARD_SCALE = 0.7;
let ORIGINAL_WIDTH = 1000;
let ORIGINAL_HEIGHT = 1000;
let selectedPiecesForMove = [];

let animations = [];
let isAnimating = false;
let animationFrame = null;
let gameStateBeforeAnimation = null;

const AnimationType = {
  MOVE: "move",
  JUMP: "jump",
  FLY: "fly",
  KICKBACK: "kickback",
};

class Animation {
  constructor(type, pieceId, path, duration = 500) {
    this.type = type;
    this.pieceId = pieceId;
    this.path = path || [];
    this.totalDuration = duration;
    this.startTime = Date.now();
    this.progress = 0;
    this.completed = false;
    this.currentSegment = 0;

    if (this.path.length > 1) {
      this.segmentDuration = this.totalDuration / (this.path.length - 1);
    } else {
      this.segmentDuration = this.totalDuration;
    }
  }

  update() {
    const elapsed = Date.now() - this.startTime;
    this.progress = Math.min(elapsed / this.totalDuration, 1);

    if (this.progress >= 1) {
      this.completed = true;
    }

    return this.getCurrentPosition();
  }

  getCurrentPosition() {
    if (!this.path || this.path.length === 0) {
      return { x: 0, y: 0 };
    }

    if (this.path.length === 1) {
      return {
        x: parseInt(this.path[0].left),
        y: parseInt(this.path[0].top),
      };
    }

    const totalSegments = this.path.length - 1;
    const currentSegmentFloat = this.progress * totalSegments;
    const currentSegmentIndex = Math.min(
      Math.floor(currentSegmentFloat),
      totalSegments - 1
    );
    const segmentProgress = currentSegmentFloat - currentSegmentIndex;

    const fromPos = this.path[currentSegmentIndex];
    const toPos = this.path[currentSegmentIndex + 1];

    let t = segmentProgress;
    switch (this.type) {
      case AnimationType.JUMP:
        t = this.easeOutQuad(t);
        break;
      case AnimationType.FLY:
        t = this.easeInOutCubic(t);
        break;
      case AnimationType.KICKBACK:
        t = this.easeOutBounce(t);
        break;
      default:
        t = this.easeInOutQuad(t);
    }

    const fromX = parseInt(fromPos.left);
    const fromY = parseInt(fromPos.top);
    const toX = parseInt(toPos.left);
    const toY = parseInt(toPos.top);

    const x = fromX + (toX - fromX) * t;
    const y = fromY + (toY - fromY) * t;

    let yOffset = 0;
    if (this.type === AnimationType.JUMP) {
      yOffset = -Math.sin(segmentProgress * Math.PI) * 20;
    } else if (this.type === AnimationType.FLY) {
      yOffset = -Math.sin(segmentProgress * Math.PI) * 30;
    }

    return { x, y: y + yOffset };
  }

  easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  easeOutQuad(t) {
    return t * (2 - t);
  }

  easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
  }

  easeOutBounce(t) {
    const n1 = 7.5625;
    const d1 = 2.75;

    if (t < 1 / d1) {
      return n1 * t * t;
    } else if (t < 2 / d1) {
      return n1 * (t -= 1.5 / d1) * t + 0.75;
    } else if (t < 2.5 / d1) {
      return n1 * (t -= 2.25 / d1) * t + 0.9375;
    } else {
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
  }
}

async function loadPositions() {
  try {
    const response = await fetch("/resources/position.json");
    positions = await response.json();
    console.log("位置数据加载成功");
  } catch (error) {
    console.error("加载位置数据失败:", error);
  }
}

async function loadAssets() {
  try {
    backgroundImg = new Image();
    backgroundImg.src = "/resources/img/background.png";
    await new Promise((resolve, reject) => {
      backgroundImg.onload = () => {
        ORIGINAL_WIDTH = backgroundImg.width;
        ORIGINAL_HEIGHT = backgroundImg.height;

        canvas.width = ORIGINAL_WIDTH * BOARD_SCALE;
        canvas.height = ORIGINAL_HEIGHT * BOARD_SCALE;

        console.log(`棋盘原始尺寸: ${ORIGINAL_WIDTH}x${ORIGINAL_HEIGHT}`);
        console.log(`棋盘显示尺寸: ${canvas.width}x${canvas.height}`);

        resolve();
      };
      backgroundImg.onerror = reject;
    });

    for (const color of ["blue", "yellow", "green", "red"]) {
      const img = new Image();
      img.src = `/resources/img/${color}.png`;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      pieceImages[color] = img;
    }

    console.log("开始加载骰子图片...");
    for (let i = 1; i <= 6; i++) {
      const img = new Image();
      const imgUrl = `/resources/img/${i}.jpg`;
      img.src = imgUrl;

      try {
        await new Promise((resolve, reject) => {
          img.onload = () => {
            console.log(
              `✓ 骰子图片 ${i}.jpg 加载成功 - 尺寸: ${img.width}x${img.height}`
            );
            diceImages[i] = img;
            resolve();
          };
          img.onerror = (err) => {
            console.error(`✗ 骰子图片 ${i}.jpg 加载失败:`, err);
            console.error(`  URL: ${imgUrl}`);
            reject(err);
          };

          setTimeout(() => {
            if (!img.complete) {
              console.warn(`⚠ 骰子图片 ${i}.jpg 加载超时`);
              reject(new Error("加载超时"));
            }
          }, 3000);
        });
      } catch (err) {
        console.error(`跳过骰子图片 ${i}:`, err);
      }
    }

    console.log("骰子图片加载完成，已加载:", Object.keys(diceImages));

    console.log("图片资源加载成功");
  } catch (error) {
    console.error("加载图片资源失败:", error);
  }
}

let animationCompleteCallback = null;

function startAnimation(animationList, onComplete) {
  gameStateBeforeAnimation = JSON.parse(JSON.stringify(gameState));
  animations = animationList;
  isAnimating = true;

  animationCompleteCallback = onComplete;

  animateLoop();
}

function animateLoop() {
  if (!isAnimating || animations.length === 0) {
    isAnimating = false;
    const callback = animationCompleteCallback;
    animationCompleteCallback = null;
    gameStateBeforeAnimation = null;
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }

    if (callback) {
      callback();
    }
    return;
  }

  animations.forEach((anim) => {
    if (!anim.completed) {
      anim.update();
    }
  });

  drawBoardWithAnimations();

  animations = animations.filter((anim) => !anim.completed);

  if (animations.length > 0) {
    animationFrame = requestAnimationFrame(animateLoop);
  } else {
    isAnimating = false;
    const callback = animationCompleteCallback;
    animationCompleteCallback = null;
    gameStateBeforeAnimation = null;

    if (callback) {
      callback();
    }
  }
}

function drawBoardWithAnimations() {
  if (!backgroundImg) return;

  const stateToRender = gameStateBeforeAnimation || gameState;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();

  const scale = BOARD_SCALE;
  ctx.scale(scale, scale);

  ctx.drawImage(backgroundImg, 0, 0, ORIGINAL_WIDTH, ORIGINAL_HEIGHT);

  const animatingPieces = new Map();
  animations.forEach((anim) => {
    const pos = anim.getCurrentPosition();
    animatingPieces.set(anim.pieceId, pos);
  });

  if (stateToRender && stateToRender.pieces) {
    const piecesByPosition = new Map();

    stateToRender.pieces.forEach((piece) => {
      if (animatingPieces.has(piece.id)) return;

      if (piece.position && typeof piece.position.id !== "undefined") {
        const posId = piece.position.id;
        if (!piecesByPosition.has(posId)) {
          piecesByPosition.set(posId, []);
        }
        piecesByPosition.get(posId).push(piece);
      }
    });

    piecesByPosition.forEach((piecesOnSpot, posId) => {
      if (piecesOnSpot.length === 0) return;

      const firstPiece = piecesOnSpot[0];
      const pieceImg = pieceImages[firstPiece.color];

      if (pieceImg && firstPiece.position) {
        const x = parseInt(firstPiece.position.left) + 5;
        const y = parseInt(firstPiece.position.top) + 5;

        ctx.drawImage(pieceImg, x, y, 40, 40);

        drawPieceNumbers(piecesOnSpot, x, y);
      }
    });

    animations.forEach((anim) => {
      const piece = stateToRender.pieces.find((p) => p.id === anim.pieceId);
      if (piece) {
        const pieceImg = pieceImages[piece.color];
        if (pieceImg) {
          const pos = anim.getCurrentPosition();
          const x = pos.x + 5;
          const y = pos.y + 5;

          ctx.save();
          ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
          ctx.shadowBlur = 10;
          ctx.shadowOffsetX = 3;
          ctx.shadowOffsetY = 3;

          ctx.drawImage(pieceImg, x, y, 40, 40);

          const pieceIndex = parseInt(piece.id.split("-")[1]) + 1;
          ctx.font = "bold 20px Arial";
          ctx.fillStyle = "#000000";
          ctx.strokeStyle = "white";
          ctx.lineWidth = 4;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          const textX = x + 20;
          const textY = y + 20;

          ctx.strokeText(pieceIndex.toString(), textX, textY);
          ctx.fillText(pieceIndex.toString(), textX, textY);

          ctx.restore();
        }
      }
    });
  }

  ctx.restore();
}

function drawPieceNumbers(piecesOnSpot, x, y) {
  if (piecesOnSpot.length === 1) {
    const piece = piecesOnSpot[0];
    const pieceIndex = parseInt(piece.id.split("-")[1]) + 1;

    ctx.font = "bold 20px Arial";
    ctx.fillStyle = "#000000";
    ctx.strokeStyle = "white";
    ctx.lineWidth = 4;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const textX = x + 20;
    const textY = y + 20;

    ctx.strokeText(pieceIndex.toString(), textX, textY);
    ctx.fillText(pieceIndex.toString(), textX, textY);
  } else {
    const pieceNumbers = piecesOnSpot
      .map((piece) => {
        return parseInt(piece.id.split("-")[1]) + 1;
      })
      .sort((a, b) => a - b);

    const numbersText = pieceNumbers.join("");

    ctx.font = "bold 18px Arial";
    ctx.fillStyle = "#000000";
    ctx.strokeStyle = "white";
    ctx.lineWidth = 4;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const textX = x + 20;
    const textY = y + 20;

    ctx.strokeText(numbersText, textX, textY);
    ctx.fillText(numbersText, textX, textY);
  }
}

function getColorHex(color) {
  return colorMap[color] || "#000000";
}

function drawDice(number) {
  if (!diceCanvas || !diceCtx) {
    console.error("骰子Canvas未初始化");
    return;
  }

  diceCtx.clearRect(0, 0, diceCanvas.width, diceCanvas.height);

  diceCtx.fillStyle = "white";
  diceCtx.fillRect(0, 0, diceCanvas.width, diceCanvas.height);

  if (number > 0 && number <= 6 && diceImages[number]) {
    try {
      diceCtx.drawImage(
        diceImages[number],
        0,
        0,
        diceCanvas.width,
        diceCanvas.height
      );
    } catch (e) {
      console.error("绘制骰子图片失败:", e);
      diceCtx.fillStyle = "#333";
      diceCtx.font = "bold 80px Arial";
      diceCtx.textAlign = "center";
      diceCtx.textBaseline = "middle";
      diceCtx.fillText(
        number.toString(),
        diceCanvas.width / 2,
        diceCanvas.height / 2
      );
    }
  } else {
    diceCtx.fillStyle = "#333";
    diceCtx.font = "bold 64px Arial";
    diceCtx.textAlign = "center";
    diceCtx.textBaseline = "middle";
    diceCtx.fillText("?", diceCanvas.width / 2, diceCanvas.height / 2);
  }
}

function drawLastDice(number) {
  if (!lastDiceCanvas || !lastDiceCtx) {
    console.error("上一轮骰子Canvas未初始化");
    return;
  }

  lastDiceCtx.clearRect(0, 0, lastDiceCanvas.width, lastDiceCanvas.height);

  lastDiceCtx.fillStyle = "white";
  lastDiceCtx.fillRect(0, 0, lastDiceCanvas.width, lastDiceCanvas.height);

  if (number > 0 && number <= 6 && diceImages[number]) {
    try {
      lastDiceCtx.drawImage(
        diceImages[number],
        0,
        0,
        lastDiceCanvas.width,
        lastDiceCanvas.height
      );
    } catch (e) {
      console.error("绘制上一轮骰子图片失败:", e);
      lastDiceCtx.fillStyle = "#333";
      lastDiceCtx.font = "bold 80px Arial";
      lastDiceCtx.textAlign = "center";
      lastDiceCtx.textBaseline = "middle";
      lastDiceCtx.fillText(
        number.toString(),
        lastDiceCanvas.width / 2,
        lastDiceCanvas.height / 2
      );
    }
  } else {
    lastDiceCtx.fillStyle = "#999";
    lastDiceCtx.font = "bold 64px Arial";
    lastDiceCtx.textAlign = "center";
    lastDiceCtx.textBaseline = "middle";
    lastDiceCtx.fillText(
      "-",
      lastDiceCanvas.width / 2,
      lastDiceCanvas.height / 2
    );
  }
}

function drawBoard(state, diceRoll = 0, highlightPieces = []) {
  if (!backgroundImg) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();

  const scale = BOARD_SCALE;

  ctx.scale(scale, scale);

  ctx.drawImage(backgroundImg, 0, 0, ORIGINAL_WIDTH, ORIGINAL_HEIGHT);

  if (state && state.pieces) {
    const piecesByPosition = new Map();

    state.pieces.forEach((piece) => {
      if (piece.position && typeof piece.position.id !== "undefined") {
        const posId = piece.position.id;
        if (!piecesByPosition.has(posId)) {
          piecesByPosition.set(posId, []);
        }
        piecesByPosition.get(posId).push(piece);
      }
    });

    piecesByPosition.forEach((piecesOnSpot, posId) => {
      if (piecesOnSpot.length === 0) return;

      const firstPiece = piecesOnSpot[0];
      const pieceImg = pieceImages[firstPiece.color];

      if (pieceImg && firstPiece.position) {
        const x = parseInt(firstPiece.position.left) + 5;
        const y = parseInt(firstPiece.position.top) + 5;

        const currentSide = players.find((p) => p.id === state.currentPlayerId);
        const shouldHighlight =
          currentSide &&
          highlightPieces.some((index) => {
            if (state.pieces) {
              const pieceToCheck = state.pieces.find(
                (p) =>
                  p.color === currentSide.color && p.id.endsWith(`-${index}`)
              );
              return pieceToCheck && pieceToCheck.id === firstPiece.id;
            }
            return false;
          });

        if (shouldHighlight) {
          ctx.save();
          ctx.shadowColor = "white";
          ctx.shadowBlur = 20;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
          ctx.strokeStyle = "white";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(x + 20, y + 20, 25, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        ctx.drawImage(pieceImg, x, y, 40, 40);

        if (piecesOnSpot.length === 1) {
          const piece = piecesOnSpot[0];
          const pieceIndex = parseInt(piece.id.split("-")[1]) + 1;

          ctx.font = "bold 20px Arial";
          ctx.fillStyle = "#000000";
          ctx.strokeStyle = "white";
          ctx.lineWidth = 4;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          const textX = x + 20;
          const textY = y + 20;

          ctx.strokeText(pieceIndex.toString(), textX, textY);
          ctx.fillText(pieceIndex.toString(), textX, textY);
        } else {
          const pieceNumbers = piecesOnSpot
            .map((piece) => {
              return parseInt(piece.id.split("-")[1]) + 1;
            })
            .sort((a, b) => a - b);

          const numbersText = pieceNumbers.join("");

          ctx.font = "bold 18px Arial";
          ctx.fillStyle = "#000000";
          ctx.strokeStyle = "white";
          ctx.lineWidth = 4;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          const textX = x + 20;
          const textY = y + 20;

          ctx.strokeText(numbersText, textX, textY);
          ctx.fillText(numbersText, textX, textY);
        }
      }
    });
  }

  ctx.restore();
}

function updateCurrentPlayer(gs) {
  const currentGameState = gs || gameState;
  if (currentGameState) {
    const currentPlayer = players.find(
      (p) => p.color === currentGameState.currentPlayerColor
    );
    if (currentPlayer) {
      currentPlayerName.textContent = currentPlayer.name;
      if (currentPlayerColor) {
        currentPlayerColor.className = "player-color";
        currentPlayerColor.classList.add(currentPlayer.color);
      }
    }
  }
}

function updateLastTurnDisplay() {
  if (lastTurnInfo.playerName) {
    lastPlayerName.textContent = lastTurnInfo.playerName;
    lastPlayerColor.style.backgroundColor =
      colorMap[lastTurnInfo.playerColor] || "#ccc";
    drawLastDice(lastTurnInfo.diceRoll);
    lastTurnEvents.textContent = lastTurnInfo.message;
  }
}

function recordLastTurn(playerName, playerColor, diceRoll, message) {
  lastTurnInfo = {
    playerName,
    playerColor,
    diceRoll,
    message,
  };
  updateLastTurnDisplay();
}

function updateUI(data, skipPlayerUpdate = false) {
  gameState = data.gameState;

  if (!skipPlayerUpdate) {
    updateCurrentPlayer();
  }

  const diceNumber = data.diceRoll || data.lastDiceRoll || 0;
  drawDice(diceNumber);

  if (data.state === "selecting" && data.movablePieces) {
    selectedPiecesForMove = data.movablePieces;
    rollDiceBtn.disabled = true;
  } else {
    selectedPiecesForMove = [];
    // 只有当状态是rolling且是自己的回合时才启用按钮
    const isMyTurn = gameState && gameState.currentPlayerColor === myPlayerColor;
    rollDiceBtn.disabled = !(data.state === "rolling" && isMyTurn);
  }

  drawBoard(gameState, diceNumber, selectedPiecesForMove);
}

function showPieceSelection(movablePieces) {
  selectedPiecesForMove = movablePieces;
  gameMessage.textContent = "请点击棋盘上高亮的棋子来移动";
}

function updatePlayersList(playersList, gs) {
  const currentGameState = gs || gameState;
  const playersListDiv = document.getElementById("players-list");
  if (!playersListDiv) return;
  
  playersListDiv.innerHTML = "";

  const playersToShow = playersList || players;
  playersToShow.forEach((player) => {
    const playerItem = document.createElement("div");
    playerItem.className = "player-item";

    // ✅ 高亮当前回合的玩家
    if (currentGameState && currentGameState.currentPlayerColor === player.color) {
      playerItem.classList.add("active");
    }

    const colorDiv = document.createElement("div");
    colorDiv.className = "player-color";
    colorDiv.classList.add(player.color);

    const nameDiv = document.createElement("div");
    nameDiv.className = "player-name";
    nameDiv.textContent = player.name;

    const statusDiv = document.createElement("div");
    statusDiv.className = "player-status";

    // ✅ 显示回合标记
    if (currentGameState && currentGameState.currentPlayerColor === player.color) {
      statusDiv.textContent = "🎯";
    }
    
    // 标记自己
    if (player.color === myPlayerColor) {
      const youBadge = document.createElement("span");
      youBadge.className = "you-badge";
      youBadge.textContent = " (你)";
      nameDiv.appendChild(youBadge);
    }

    playerItem.appendChild(colorDiv);
    playerItem.appendChild(nameDiv);
    playerItem.appendChild(statusDiv);
    playersListDiv.appendChild(playerItem);
  });
}

canvas.addEventListener("click", (e) => {
  if (isAnimating) {
    return;
  }

  if (selectedPiecesForMove.length === 0) return;
  if (!gameState) return;

  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;

  const scale = BOARD_SCALE;
  const originalX = clickX / scale;
  const originalY = clickY / scale;

  const currentPlayerColor = gameState.currentPlayerColor;
  const currentPlayerPieces = gameState.pieces.filter(
    (p) => p.color === currentPlayerColor
  );

  for (let i = 0; i < currentPlayerPieces.length; i++) {
    const piece = currentPlayerPieces[i];
    if (!piece.position) continue;

    const pieceX = parseInt(piece.position.left) + 5;
    const pieceY = parseInt(piece.position.top) + 5;
    const pieceCenterX = pieceX + 20;
    const pieceCenterY = pieceY + 20;

    const distance = Math.sqrt(
      Math.pow(originalX - pieceCenterX, 2) +
        Math.pow(originalY - pieceCenterY, 2)
    );

    if (distance <= 30) {
      if (selectedPiecesForMove.includes(i)) {
        selectPiece(i);
        return;
      }
    }
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    console.log("页面隐藏，暂停动画");
    if (isAnimating && animationFrame) {
      cancelAnimationFrame(animationFrame);
    }
  } else {
    console.log("页面显示，恢复状态");
    if (isAnimating) {
      const callback = animationCompleteCallback;

      isAnimating = false;
      animations = [];
      animationCompleteCallback = null;
      gameStateBeforeAnimation = null;
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }

      if (callback) {
        console.log("执行被中断动画的回调");
        callback();
      }
    }
    if (gameState) {
      drawBoard(gameState, 0, selectedPiecesForMove);
    }
  }
});

// ============ Socket.IO 事件监听器 ============

const readyBtn = document.getElementById("ready-btn");
const generateRoomBtn = document.getElementById("generate-room-btn");

// 生成4位数房间号
function generateRoomId() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// 生成房间按钮
generateRoomBtn.addEventListener("click", () => {
  const roomId = generateRoomId();
  roomIdInput.value = roomId;
  joinRoomBtn.disabled = false;
  joinRoomBtn.textContent = "创建房间（房主）";
});

// 允许手动输入房间号
roomIdInput.addEventListener("input", () => {
  if (roomIdInput.value.trim()) {
    joinRoomBtn.disabled = false;
    joinRoomBtn.textContent = "加入房间";
  } else {
    joinRoomBtn.disabled = true;
  }
});

// 加入房间
joinRoomBtn.addEventListener("click", () => {
  const roomId = roomIdInput.value.trim();
  const playerName = playerNameInput.value.trim() || "玩家";
  
  if (!roomId) {
    alert("请先生成或输入房间号");
    return;
  }
  
  currentRoomId = roomId;
  myPlayerName = playerName;
  
  socket.emit("joinRoom", { roomId, playerName });
  
  joinRoomBtn.disabled = true;
  roomIdInput.disabled = true;
  playerNameInput.disabled = true;
  generateRoomBtn.disabled = true;
});

// 准备按钮
readyBtn.addEventListener("click", () => {
  socket.emit("playerReady");
});

// 开始游戏按钮
startGameBtn.addEventListener("click", () => {
  socket.emit("startGame");
});

// 掷骰子按钮
rollDiceBtn.addEventListener("click", () => {
  console.log("点击掷骰子按钮");
  socket.emit("rollDice");
});

// 重置游戏按钮
resetGameBtn.addEventListener("click", () => {
  if (confirm("确定要重新开始游戏吗？")) {
    socket.emit("resetGame");
  }
});

// 房间更新
socket.on("roomUpdate", (data) => {
  console.log("房间更新:", data);
  
  waitingRoom.style.display = "block";
  
  // 更新房间玩家列表
  roomPlayersList.innerHTML = "";
  data.players.forEach((player) => {
    const playerDiv = document.createElement("div");
    playerDiv.className = "room-player";
    const colorName = player.color === "blue" ? "蓝" : player.color === "yellow" ? "黄" : player.color === "green" ? "绿" : "红";
    const hostTag = player.isHost ? '<span class="host-tag">房主</span>' : '';
    const youTag = player.id === socket.id ? '<span class="you-tag">(你)</span>' : '';
    const readyTag = player.ready ? '<span class="ready-tag">✓已准备</span>' : '<span class="not-ready-tag">未准备</span>';
    
    playerDiv.innerHTML = `
      <span class="player-color-dot" style="background: ${colorMap[player.color]}"></span>
      <span>${player.name} (${colorName}色) ${hostTag}${youTag}</span>
      ${readyTag}
    `;
    roomPlayersList.appendChild(playerDiv);
    
    if (player.id === socket.id) {
      myPlayerColor = player.color;
      
      // 更新准备按钮文字
      readyBtn.textContent = player.ready ? "取消准备" : "准备";
      readyBtn.className = player.ready ? "btn btn-warning" : "btn btn-secondary";
      
      // 如果是房主，显示开始游戏按钮
      if (player.isHost) {
        startGameBtn.style.display = "inline-block";
        readyBtn.style.display = "none"; // 房主不需要准备按钮（自动准备）
      } else {
        startGameBtn.style.display = "none";
        readyBtn.style.display = "inline-block";
      }
    }
  });
  
  // 更新开始按钮状态（仅房主可见）
  startGameBtn.disabled = !data.canStart;
  
  // 更新玩家列表
  players = data.players.map(p => ({
    id: p.name,
    name: p.name,
    color: p.color
  }));
});

// 游戏开始
socket.on("gameStart", (data) => {
  console.log("游戏开始:", data);
  
  setupPanel.style.display = "none";
  gamePanel.style.display = "block";
  
  initDiceCanvas();
  updateUI(data);
  drawDice(0);
  
  const isMyTurn = data.gameState.currentPlayerColor === myPlayerColor;
  gameMessage.textContent = isMyTurn ? "你的回合！请掷骰子" : "等待其他玩家...";
  rollDiceBtn.disabled = !isMyTurn;
});

// 掷骰子结果
socket.on("rollResult", (data) => {
  console.log("掷骰子结果:", data);
  
  // ✅ 更新游戏状态：如果切换玩家则使用 nextPlayer，否则使用 gameState
  if (data.switchPlayer && data.nextPlayer) {
    gameState = data.nextPlayer;
  } else {
    gameState = data.gameState;
  }
  
  // ✅ 更新上一轮信息（当前掷骰子的玩家）
  const lastPlayer = players.find(
    (p) => p.color === data.gameState.currentPlayerColor
  );
  if (lastPlayer) {
    lastTurnInfo.playerName = lastPlayer.name;
    lastTurnInfo.playerColor = lastPlayer.color;
    lastTurnInfo.diceRoll = data.diceRoll;
    lastTurnInfo.message = data.message;
    
    // 更新上一轮玩家显示
    if (lastPlayerColor && lastPlayerName) {
      lastPlayerColor.className = "player-color";
      lastPlayerColor.classList.add(lastPlayer.color);
      lastPlayerName.textContent = lastPlayer.name;
    }
    
    // 更新上一轮骰子
    drawLastDice(data.diceRoll);
    
    // 更新上一轮消息
    if (lastTurnEvents) {
      lastTurnEvents.textContent = data.message || '-';
    }
  }
  
  // ✅ 更新当前玩家信息
  const currentPlayer = players.find(
    (p) => p.color === gameState.currentPlayerColor
  );
  if (currentPlayer) {
    currentTurnInfo.playerName = currentPlayer.name;
    currentTurnInfo.playerColor = currentPlayer.color;
    currentTurnInfo.diceRoll = data.diceRoll;
    
    // 更新当前玩家显示
    updateCurrentPlayer(gameState);
  }

  // 更新当前骰子显示
  drawDice(data.diceRoll);
  
  // ✅ 更新玩家列表（高亮当前回合玩家）
  updatePlayersList(players, gameState);

  if (data.movablePieces && data.movablePieces.length > 0) {
    // 有可移动棋子
    selectedPiecesForMove = data.movablePieces;
    drawBoard(gameState, data.diceRoll, selectedPiecesForMove);
    gameMessage.textContent = `骰子点数: ${data.diceRoll} - ${data.message}`;
    
    const isMyTurn = gameState.currentPlayerColor === myPlayerColor;
    if (!isMyTurn) {
      selectedPiecesForMove = [];
    }
    rollDiceBtn.disabled = true;
  } else {
    // 没有可移动棋子，已经切换回合
    gameMessage.textContent = data.message;
    selectedPiecesForMove = [];
    drawBoard(gameState, data.diceRoll, selectedPiecesForMove);
    
    // ✅ 更新按钮状态
    const isMyTurn = gameState.currentPlayerColor === myPlayerColor;
    rollDiceBtn.disabled = !isMyTurn;
  }
});

// 移动结果
socket.on("moveResult", (data) => {
  console.log("移动结果:", data);
  
  // ✅ 更新游戏状态：如果切换玩家则使用 nextPlayer，否则使用 gameState
  if (data.switchPlayer && data.nextPlayer) {
    gameState = data.nextPlayer;
  } else {
    gameState = data.gameState;
  }
  
  // ✅ 更新上一轮信息（刚才移动棋子的玩家）
  const lastPlayer = players.find(
    (p) => p.color === data.gameState.currentPlayerColor
  );
  if (lastPlayer) {
    lastTurnInfo.playerName = lastPlayer.name;
    lastTurnInfo.playerColor = lastPlayer.color;
    lastTurnInfo.diceRoll = data.diceRoll;
    lastTurnInfo.message = data.moveEvents ? data.moveEvents.join(', ') : data.message;
    
    // 更新上一轮玩家显示
    if (lastPlayerColor && lastPlayerName) {
      lastPlayerColor.className = "player-color";
      lastPlayerColor.classList.add(lastPlayer.color);
      lastPlayerName.textContent = lastPlayer.name;
    }
    
    // 更新上一轮骰子
    drawLastDice(data.diceRoll);
    
    // 更新上一轮事件
    if (lastTurnEvents && data.moveEvents) {
      lastTurnEvents.innerHTML = data.moveEvents
        .map((event) => `<div class="event-item">${event}</div>`)
        .join("");
    }
  }
  
  selectedPiecesForMove = [];
  gameMessage.textContent = data.message;

  if (data.animationData && data.animationData.length > 0) {
    playAnimations(data.animationData, () => {
      updateUIAfterMove(data);
    });
  } else {
    updateUIAfterMove(data);
  }
});

// 游戏重置
socket.on("gameReset", (data) => {
  console.log("游戏重置:", data);
  
  gameState = null;
  selectedPiecesForMove = [];
  
  gamePanel.style.display = "none";
  setupPanel.style.display = "block";
  waitingRoom.style.display = "none";
  
  joinRoomBtn.disabled = false;
  roomIdInput.disabled = false;
  playerNameInput.disabled = false;
  
  gameMessage.textContent = "";
});

// 玩家离开
socket.on("playerLeft", (data) => {
  console.log("玩家离开:", data);
  alert(data.message);
  
  players = data.players.map(p => ({
    id: p.name,
    name: p.name,
    color: p.color
  }));
  
  // 如果游戏中有玩家离开，可能需要重置游戏
  if (gameState) {
    alert("有玩家离开，游戏将重置");
    socket.emit("resetGame");
  }
});

// 错误处理
socket.on("error", (data) => {
  console.error("Socket错误:", data);
  alert(data.message);
  
  if (data.message === "不是你的回合") {
    rollDiceBtn.disabled = true;
  }
});

// ============ 辅助函数 ============

// 选择棋子函数（供 canvas 点击事件调用）
function selectPiece(pieceIndex) {
  if (!selectedPiecesForMove.includes(pieceIndex)) {
    return;
  }
  console.log("选择棋子:", pieceIndex);
  socket.emit("movePiece", { pieceIndex });
}

function updateUIAfterMove(data) {
  // ✅ 游戏状态已在 moveResult 中更新，这里直接使用全局的 gameState
  
  // ✅ 更新当前玩家显示
  updateCurrentPlayer(gameState);
  
  // ✅ 更新玩家列表（高亮当前回合玩家）
  updatePlayersList(players, gameState);
  
  const isMyTurn = gameState.currentPlayerColor === myPlayerColor;
  
  if (data.canRollAgain && isMyTurn) {
    gameMessage.textContent = "掷到6！可以再掷一次骰子";
    rollDiceBtn.disabled = false;
  } else {
    if (isMyTurn) {
      gameMessage.textContent = "你的回合！请掷骰子";
    } else {
      const currentPlayer = players.find(
        (p) => p.color === gameState.currentPlayerColor
      );
      gameMessage.textContent = currentPlayer 
        ? `等待 ${currentPlayer.name} 的回合` 
        : "等待其他玩家...";
    }
    rollDiceBtn.disabled = !isMyTurn;
  }
  
  // 清除当前骰子显示，准备下一回合
  if (!data.canRollAgain) {
    drawDice(0);
  }
  
  drawBoard(gameState, 0, []);
}

function playAnimations(animationData, callback) {
  if (!animationData || animationData.length === 0) {
    if (callback) callback();
    return;
  }

  const allAnims = animationData.map((anim) => {
    const baseTimePerStep =
      anim.type === "FLY"
        ? 150
        : anim.type === "JUMP"
        ? 180
        : anim.type === "KICKBACK"
        ? 400
        : 200;

    const pathLength = anim.path ? anim.path.length : 2;
    const totalDuration = baseTimePerStep * Math.max(pathLength - 1, 1);

    return new Animation(
      AnimationType[anim.type],
      anim.pieceId,
      anim.path || [anim.from, anim.to],
      totalDuration
    );
  });

  const moveAnims = allAnims.filter(anim => anim.type !== AnimationType.KICKBACK);
  const kickbackAnims = allAnims.filter(anim => anim.type === AnimationType.KICKBACK);

  const runKickback = () => {
    if (kickbackAnims.length > 0) {
      startAnimation(kickbackAnims, () => {
        drawBoard(gameState, 0, []);
        if (callback) callback();
      });
    } else {
      drawBoard(gameState, 0, []);
      if (callback) callback();
    }
  };

  if (moveAnims.length > 0) {
    startAnimation(moveAnims, runKickback);
  } else {
    runKickback();
  }
}

async function init() {
  await loadPositions();
  await loadAssets();

  console.log("游戏初始化完成");
}

init();
