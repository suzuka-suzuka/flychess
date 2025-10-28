import { GameState, RoomState } from './GameState.js';
import { Game } from './Chess.js';

/**
 * 游戏房间类
 */
export class Room {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = [];
    this.hostId = null;
    this.gameInstance = null;
    this.state = RoomState.WAITING;
    this.lastDiceRoll = 0;
    this.canRollAgain = false;
  }

  /**
   * 添加玩家
   */
  addPlayer(socketId, playerName) {
    if (this.players.length >= 4) {
      throw new Error('房间已满');
    }

    const colors = ['blue', 'yellow', 'green', 'red'];
    const availableColor = colors.find(
      (c) => !this.players.find((p) => p.color === c)
    );

    if (!availableColor) {
      throw new Error('没有可用的颜色');
    }

    const isHost = this.players.length === 0;
    if (isHost) {
      this.hostId = socketId;
    }

    const player = {
      id: socketId,
      name: playerName,
      color: availableColor,
      isHost: isHost,
      ready: isHost, // 房主自动准备
    };

    this.players.push(player);
    return player;
  }

  /**
   * 移除玩家
   */
  removePlayer(socketId) {
    const playerIndex = this.players.findIndex((p) => p.id === socketId);
    if (playerIndex === -1) {
      return null;
    }

    const removedPlayer = this.players.splice(playerIndex, 1)[0];

    // 如果房主离开，转移房主权限
    if (this.hostId === socketId && this.players.length > 0) {
      this.hostId = this.players[0].id;
      this.players[0].isHost = true;
      this.players[0].ready = true;
    }

    return removedPlayer;
  }

  /**
   * 切换玩家准备状态
   */
  togglePlayerReady(socketId) {
    const player = this.players.find((p) => p.id === socketId);
    if (!player) {
      throw new Error('玩家不存在');
    }

    player.ready = !player.ready;
    return player.ready;
  }

  /**
   * 检查是否可以开始游戏
   */
  canStartGame() {
    const allReady = this.players.every((p) => p.ready);
    const validPlayerCount = this.players.length >= 2 && this.players.length <= 4;
    return allReady && validPlayerCount && this.state === RoomState.WAITING;
  }

  /**
   * 检查是否是房主
   */
  isHost(socketId) {
    return this.hostId === socketId;
  }

  /**
   * 开始游戏
   */
  startGame() {
    if (!this.canStartGame()) {
      throw new Error('游戏无法开始');
    }

    const gamePlayers = this.players.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
    }));

    this.gameInstance = new Game(gamePlayers);
    this.state = RoomState.PLAYING;
    this.lastDiceRoll = 0;
    this.canRollAgain = false;
  }

  /**
   * 重置游戏
   */
  resetGame() {
    this.gameInstance = null;
    this.state = RoomState.WAITING;
    this.lastDiceRoll = 0;
    this.canRollAgain = false;
  }

  /**
   * 根据 socket.id 获取玩家信息
   */
  getPlayer(socketId) {
    return this.players.find((p) => p.id === socketId);
  }

  /**
   * 检查是否是当前玩家的回合
   * @param {string} socketId - 玩家的 socket.id
   * @returns {boolean}
   */
  isCurrentPlayer(socketId) {
    if (!this.gameInstance) {
      return false;
    }
    
    const player = this.getPlayer(socketId);
    if (!player) {
      return false;
    }
    
    const currentColor = this.gameInstance.currentSide.color;
    return player.color === currentColor;
  }

  /**
   * 获取当前回合玩家
   * @returns {object|null}
   */
  getCurrentPlayer() {
    if (!this.gameInstance) {
      return null;
    }
    
    const currentColor = this.gameInstance.currentSide.color;
    return this.players.find((p) => p.color === currentColor);
  }

  /**
   * 获取玩家颜色
   */
  getPlayerColor(socketId) {
    const player = this.getPlayer(socketId);
    return player ? player.color : null;
  }

  /**
   * 获取玩家名字
   */
  getPlayerName(socketId) {
    const player = this.getPlayer(socketId);
    return player ? player.name : null;
  }

  /**
   * 房间是否为空
   */
  isEmpty() {
    return this.players.length === 0;
  }

  /**
   * 获取房间信息
   */
  getRoomInfo() {
    return {
      roomId: this.roomId,
      players: this.players,
      hostId: this.hostId,
      state: this.state,
      canStart: this.canStartGame(),
      gameState: this.gameInstance ? this.gameInstance.getGameState() : null,
    };
  }
}
