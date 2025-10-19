import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { Piece } from "./Pieces.js"
import { Position } from "./Position.js"
import { RED, BLUE, GREEN, YELLOW } from "./Road.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const Rule = {
  rollback: side =>
    console.info(`玩家 ${side.q} (${side.color}) 掷出了三个6，棋子正在退回！`)
}

const dataDir = path.join(__dirname, "../resources/")

class Side {
  constructor(color, playerId, pieces) {
    this.q = playerId

    this.pieces = pieces

    this.color = color

    this.win = false

    this.up0 = 0

    this.up1 = 0
  }

  test(step) {
    if (step === 6 && this.up0 === 6 && this.up1 === 6) {
      Rule.rollback(this)
      this.up1 = -1
      this.up0 = -1
      return true
    }
    this.up1 = this.up0
    this.up0 = step
    return false
  }

  step(step, pieceIndex, allPieces) {
    const pieceToMove = this.pieces[pieceIndex]
    if (pieceToMove) {
      pieceToMove.jumpStep(step, allPieces)
    } else {
      console.error(`错误：颜色为 ${this.color} 的棋子索引 ${pieceIndex} 无效。`)
    }
  }

  checkWinCondition() {
    const allPiecesWon = this.pieces.every(p => p.win)
    if (allPiecesWon) {
      this.win = true
      console.info(`玩家 ${this.q} (${this.color}) 赢得了游戏！`);
    }
    return this.win
  }
}

function initSide(color, playerId) {
  const coordFile = `${color}Coord.json`
  const roadTemplate = { red: RED, blue: BLUE, green: GREEN, yellow: YELLOW }[color]

  if (!roadTemplate) {
    console.error(`[飞行棋] 错误: 无效的颜色 "${color}"`)
    return null
  }

  try {
    const filePath = path.join(dataDir, coordFile)
    const jsonString = fs.readFileSync(filePath, "utf-8")
    const initialCoords = JSON.parse(jsonString)

    const pieces = initialCoords.map((coord, index) => {
      const initialPosition = new Position(coord)
      const pieceId = `${color}-${index}`
      return new Piece(initialPosition, color, roadTemplate, pieceId)
    })

    return new Side(color, playerId, pieces)
  } catch (e) {
    console.error(`[飞行棋] 初始化 ${color} 方时出错: 无法加载或解析 ${coordFile}`, e)
    return null
  }
}

export { Side, initSide }
