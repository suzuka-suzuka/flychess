/**
 * 游戏状态枚举
 */
export const GameState = {
  WAITING: "waiting",    // 等待玩家加入
  PLAYING: "playing",    // 游戏进行中
  ROLLING: "rolling",    // 等待掷骰子
  SELECTING: "selecting", // 选择棋子移动
  FINISHED: "finished",  // 游戏结束
};

/**
 * 房间状态枚举
 */
export const RoomState = {
  WAITING: "waiting",    // 等待开始
  PLAYING: "playing",    // 游戏中
};
