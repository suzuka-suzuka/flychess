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
const startGameBtn = document.getElementById("start-game-btn");
const rollDiceBtn = document.getElementById("roll-dice-btn");
const resetGameBtn = document.getElementById("reset-game-btn");
const playerCountSelect = document.getElementById("player-count");
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
          ctx.shadowColor = "#000000";
          ctx.shadowBlur = 20;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
          ctx.strokeStyle = "#000000";
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

function updateCurrentPlayer() {
  if (gameState) {
    const currentPlayer = players.find(
      (p) => p.id === gameState.currentPlayerId
    );
    if (currentPlayer) {
      currentPlayerName.textContent = currentPlayer.name;
      currentPlayerColor.style.backgroundColor =
        colorMap[gameState.currentPlayerColor];
    }
  }
  updatePlayersList();
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
    rollDiceBtn.disabled = data.state !== "rolling";
  }

  drawBoard(gameState, diceNumber, selectedPiecesForMove);
}

function showPieceSelection(movablePieces) {
  selectedPiecesForMove = movablePieces;
  gameMessage.textContent = "请点击棋盘上高亮的棋子来移动";
}

function updatePlayersList() {
  const playersList = document.getElementById("players-list");
  playersList.innerHTML = "";

  players.forEach((player) => {
    const playerItem = document.createElement("div");
    playerItem.className = "player-item";

    if (gameState && gameState.currentPlayerId === player.id) {
      playerItem.classList.add("active");
    }

    const colorDiv = document.createElement("div");
    colorDiv.className = "player-item-color";
    colorDiv.style.backgroundColor = colorMap[player.color];

    const nameDiv = document.createElement("div");
    nameDiv.className = "player-item-name";
    nameDiv.textContent = player.name;

    const statusDiv = document.createElement("div");
    statusDiv.className = "player-item-status";

    if (gameState && gameState.currentPlayerId === player.id) {
      statusDiv.textContent = "🎯";
    }

    playerItem.appendChild(colorDiv);
    playerItem.appendChild(nameDiv);
    playerItem.appendChild(statusDiv);
    playersList.appendChild(playerItem);
  });
}

async function startGame() {
  const playerCount = parseInt(playerCountSelect.value);
  players = [];

  for (let i = 1; i <= playerCount; i++) {
    const input = document.getElementById(`player${i}`);
    const name = input.value.trim() || `玩家${i}`;
    players.push({ id: name, name: name });
  }

  try {
    const response = await fetch("/api/game/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ players: players.map((p) => p.id) }),
    });

    const data = await response.json();

    if (data.success) {
      data.gameState.pieces.forEach((piece) => {
        const playerId = piece.id.split("-")[0];
        const player = players.find((p) => p.name === playerId);
        if (player && !player.color) {
          player.color = piece.color;
        }
      });

      const colors = ["blue", "yellow", "green", "red"];
      players.forEach((player, index) => {
        player.color = colors[index];
      });

      setupPanel.style.display = "none";
      gamePanel.style.display = "block";

      initDiceCanvas();

      updateUI(data);
      drawDice(0);
      gameMessage.textContent = "游戏开始！请掷骰子";
    } else {
      alert(data.error || "创建游戏失败");
    }
  } catch (error) {
    console.error("开始游戏失败:", error);
    alert("开始游戏失败");
  }
}

async function rollDice() {
  rollDiceBtn.disabled = true;

  try {
    const response = await fetch("/api/game/roll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const data = await response.json();

    console.log("掷骰子返回数据:", JSON.stringify(data, null, 2));

    if (data.success) {
      const currentPlayer = players.find(
        (p) => p.id === gameState.currentPlayerId
      );

      updateUI(data);

      let message = "";
      let lastTurnMessage = `掷出 ${data.diceRoll}`;

      if (data.rollback) {
        message = "三个6！所有棋子退回基地！";
        lastTurnMessage += "，三个6！所有棋子退回基地";
      } else if (data.movablePieces) {
        message = `掷出 ${data.diceRoll}，请点击棋子移动`;
      } else {
        message = `掷出 ${data.diceRoll}，${data.message}`;
        lastTurnMessage += `，${data.message}`;
      }

      if (data.canRollAgain) {
        message += " - 掷到6，可以再掷一次！";
      }

      gameMessage.textContent = message;

      console.log("检查是否需要切换玩家:");
      console.log("  data.switchPlayer =", data.switchPlayer);
      console.log("  data.nextPlayer =", data.nextPlayer);

      if (data.switchPlayer && currentPlayer) {
        console.log("✓ 需要切换玩家，记录上一轮信息");
        recordLastTurn(
          currentPlayer.name,
          currentPlayer.color,
          data.diceRoll,
          lastTurnMessage
        );

        if (data.nextPlayer) {
          gameState = data.nextPlayer;
        } else {
          fetch("/api/game/state")
            .then((res) => res.json())
            .then((stateData) => {
              gameState = stateData.gameState;
              updateCurrentPlayer();
              drawBoard(gameState, 0, []);
            });
        }
        updateCurrentPlayer();
        drawDice(0);
        drawBoard(gameState, 0, []);
        gameMessage.textContent = "请掷骰子";
      } else if (!data.switchPlayer && !data.movablePieces) {
        console.log("✓ 可以再掷一次骰子");
        rollDiceBtn.disabled = false;
      }
    } else {
      alert(data.error || "掷骰子失败");
      rollDiceBtn.disabled = false;
    }
  } catch (error) {
    console.error("掷骰子失败:", error);
    alert("掷骰子失败");
    rollDiceBtn.disabled = false;
  }
}

async function selectPiece(pieceIndex) {
  const playerBeforeMove = players.find(
    (p) => p.id === gameState.currentPlayerId
  );

  try {
    const response = await fetch("/api/game/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pieceIndex }),
    });

    const data = await response.json();

    console.log("=== selectPiece 收到的数据 ===");
    console.log("完整数据:", JSON.stringify(data, null, 2));

    if (data.success) {
      data.playerBeforeMove = playerBeforeMove;

      console.log("移动前的玩家:", playerBeforeMove);

      updateUI(data, true);

      if (data.animationData && data.animationData.length > 0) {
        const allAnims = data.animationData.map((anim) => {
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
              drawBoard(gameState, 0, selectedPiecesForMove);
              handleAfterMove(data);
            });
          } else {
            drawBoard(gameState, 0, selectedPiecesForMove);
            handleAfterMove(data);
          }
        };

        if (moveAnims.length > 0) {
          startAnimation(moveAnims, runKickback);
        } else {
          runKickback();
        }
      } else {
        drawBoard(gameState, 0, selectedPiecesForMove);
        handleAfterMove(data);
      }
    } else {
      alert(data.error || "移动棋子失败");
    }
  } catch (error) {
    console.error("选择棋子失败:", error);
    alert("选择棋子失败");
  }
}

function handleAfterMove(data) {
  const currentPlayer = data.playerBeforeMove;

  console.log("=== handleAfterMove 调试信息 ===");
  console.log("移动前的玩家:", currentPlayer);
  console.log("骰子点数:", data.diceRoll);
  console.log("移动事件:", data.moveEvents);
  console.log("是否切换玩家:", data.switchPlayer);
  console.log("是否可以再掷:", data.canRollAgain);

  let moveMessage = `掷出 ${data.diceRoll}，${data.moveEvents.join(" → ")}`;

  let message = "棋子移动成功";
  if (data.canRollAgain) {
    message += " - 掷到6，可以再掷一次！";
  }
  gameMessage.textContent = message;

  selectedPiecesForMove = [];

  if (currentPlayer && data.moveEvents && data.moveEvents.length > 0) {
    recordLastTurn(
      currentPlayer.name,
      currentPlayer.color,
      data.diceRoll,
      moveMessage
    );
  }

  if (data.switchPlayer) {
    if (data.nextPlayer) {
      gameState = data.nextPlayer;
    } else {
      fetch("/api/game/state")
        .then((res) => res.json())
        .then((stateData) => {
          gameState = stateData.gameState;
          updateCurrentPlayer();
          drawBoard(gameState, 0, []);
        });
    }
    updateCurrentPlayer();
    drawDice(0);
    drawBoard(gameState, 0, []);
    gameMessage.textContent = "请掷骰子";
    rollDiceBtn.disabled = false;
  } else if (data.canRollAgain) {
    console.log("✓ 掷到6，可以再掷一次");
    drawDice(0);
    drawBoard(gameState, 0, []);
    gameMessage.textContent = "掷到6！可以再掷一次骰子";
    rollDiceBtn.disabled = false;
  } else {
    console.log("⚠ 未知状态");
    rollDiceBtn.disabled = false;
  }
}

async function resetGame() {
  if (!confirm("确定要重新开始吗？")) return;

  try {
    await fetch("/api/game/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    location.reload();
  } catch (error) {
    console.error("重置游戏失败:", error);
    alert("重置游戏失败");
  }
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

startGameBtn.addEventListener("click", startGame);
rollDiceBtn.addEventListener("click", rollDice);
resetGameBtn.addEventListener("click", resetGame);

playerCountSelect.addEventListener("change", (e) => {
  const count = parseInt(e.target.value);
  for (let i = 1; i <= 4; i++) {
    const input = document.getElementById(`player${i}`);
    input.parentElement.style.display = i <= count ? "flex" : "none";
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

async function init() {
  await loadPositions();
  await loadAssets();

  playerCountSelect.dispatchEvent(new Event("change"));

  console.log("游戏初始化完成");
}

init();
