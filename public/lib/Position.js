class Position {
  constructor({ id, top, left, color, super: s, r, state }) {
    this.id = id;
    this.top = top;
    this.left = left;
    this.color = color;
    this.s = s;
    this.r = r;
    this.state = state;
  }

  intLeft() {
    return Math.floor(parseFloat(this.left));
  }

  intTop() {
    return Math.floor(parseFloat(this.top));
  }

  toString() {
    return `Position{id=${this.id}, top='${this.top}', left='${this.left}', color='${this.color}', s='${this.s}', r='${this.r}', state='${this.state}'}`;
  }

  equals(other) {
    if (this === other) return true;
    if (!other || typeof other.id === "undefined") return false;
    return this.id === other.id;
  }
}

let POSITIONS = [];
let ID2POSITION = new Map();

async function initPositions() {
  try {
    const response = await fetch("/resources/position.json");
    const rawPositions = await response.json();

    POSITIONS = rawPositions.map((p) => new Position(p));

    for (const position of POSITIONS) {
      ID2POSITION.set(position.id, position);
    }

    console.log("[飞行棋] 位置数据加载成功");
    return true;
  } catch (e) {
    console.error("[飞行棋] 加载或解析 position.json 时出错:", e);
    return false;
  }
}

export { Position, POSITIONS, ID2POSITION, initPositions };
