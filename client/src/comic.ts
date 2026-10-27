// Comic-book drawing helpers: halftone dots, starburst action words,
// speech bubbles, caption boxes, and the ever-present thick black outline.

export const INK = '#14100c'
export const PAPER = '#f7f1de'

export function outline(ctx: CanvasRenderingContext2D, w = 4) {
  ctx.lineWidth = w
  ctx.strokeStyle = INK
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.stroke()
}

export function fillStroke(ctx: CanvasRenderingContext2D, fill: string, w = 4) {
  ctx.fillStyle = fill
  ctx.fill()
  outline(ctx, w)
}

// Halftone dot pattern (Ben-Day dots). Cached per color/spacing.
const patternCache = new Map<string, CanvasPattern>()
export function halftone(ctx: CanvasRenderingContext2D, color = '#14100c', spacing = 8, r = 1.4): CanvasPattern {
  const key = `${color}|${spacing}|${r}`
  const hit = patternCache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = c.height = spacing * 2
  const g = c.getContext('2d')!
  g.fillStyle = color
  for (const [dx, dy] of [[0, 0], [spacing, spacing], [spacing * 2, 0], [0, spacing * 2]]) {
    g.beginPath(); g.arc(dx, dy, r, 0, Math.PI * 2); g.fill()
  }
  const p = ctx.createPattern(c, 'repeat')!
  patternCache.set(key, p)
  return p
}

// Jagged starburst with action text: "MEOW!", "KER-PLUNK!", "BOOP!".
export function burst(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, text: string, t: number, fill = '#ffd23f') {
  const pts = 11
  const rot = -0.12 + Math.sin(x * 7 + y * 13) * 0.06
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  const grow = t < 0.15 ? t / 0.15 : t > 0.8 ? Math.max(0, 1 - (t - 0.8) / 0.2) : 1
  ctx.scale(grow * r / 100, grow * r / 100)
  ctx.beginPath()
  for (let i = 0; i < pts * 2; i++) {
    const a = (i / (pts * 2)) * Math.PI * 2
    const rad = i % 2 === 0 ? 100 : 62 + (i * 37 % 14)
    const px = Math.cos(a) * rad, py = Math.sin(a) * rad * 0.78
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.shadowColor = INK; ctx.shadowOffsetX = 5; ctx.shadowOffsetY = 5; ctx.shadowBlur = 0
  fillStroke(ctx, fill, 6)
  ctx.shadowColor = 'transparent'
  ctx.font = `700 ${text.length > 7 ? 26 : 34}px Bangers, Impact, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 5; ctx.strokeStyle = INK
  ctx.strokeText(text, 0, 2)
  ctx.fillStyle = '#fff'
  ctx.fillText(text, 0, 2)
  ctx.restore()
}

// Rounded-rect speech bubble with a tail, centred above (x,y).
export function speechBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, alpha = 1) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.font = '700 20px Bangers, Impact, sans-serif'
  const w = Math.max(56, ctx.measureText(text).width + 28)
  const h = 34
  const bx = x - w / 2, by = y - h - 22
  ctx.beginPath()
  roundRect(ctx, bx, by, w, h, 10)
  ctx.fillStyle = '#fff'; ctx.fill()
  outline(ctx, 3.5)
  // tail
  ctx.beginPath()
  ctx.moveTo(x - 8, by + h - 2)
  ctx.lineTo(x + 2, y - 6)
  ctx.lineTo(x + 12, by + h - 2)
  ctx.closePath()
  ctx.fillStyle = '#fff'; ctx.fill()
  outline(ctx, 3.5)
  // re-cover the seam where the tail meets the bubble
  ctx.fillStyle = '#fff'
  ctx.fillRect(x - 8, by + h - 4, 20, 5)
  ctx.fillStyle = INK
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, by + h / 2 + 1)
  ctx.restore()
}

// Comic caption box (top-left rectangular narration panel).
export function captionBox(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, t: number) {
  const slide = t < 0.12 ? t / 0.12 : 1
  ctx.save()
  ctx.translate((1 - slide) * -340, 0)
  ctx.font = '700 24px Bangers, Impact, sans-serif'
  const w = ctx.measureText(text).width + 36
  ctx.beginPath()
  ctx.rect(x, y, w, 42)
  ctx.shadowColor = INK; ctx.shadowOffsetX = 4; ctx.shadowOffsetY = 4; ctx.shadowBlur = 0
  fillStroke(ctx, '#ffd23f', 4)
  ctx.shadowColor = 'transparent'
  ctx.fillStyle = INK
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.fillText(text, x + 18, y + 23)
  ctx.restore()
}

// Small "E: do the thing" prompt bubble.
export function promptBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
  ctx.save()
  ctx.font = '700 15px Bangers, Impact, sans-serif'
  const label = `[E] ${text}`
  const w = ctx.measureText(label).width + 20
  ctx.beginPath()
  roundRect(ctx, x - w / 2, y - 30, w, 24, 8)
  ctx.fillStyle = '#fff'
  ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = 1
  outline(ctx, 3)
  ctx.fillStyle = INK
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(label, x, y - 17)
  ctx.restore()
}

// Big outlined comic title text.
export function comicText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill = '#fff', rot = 0) {
  ctx.save()
  ctx.translate(x, y); ctx.rotate(rot)
  ctx.font = `400 ${size}px Bangers, Impact, sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.lineWidth = size / 8; ctx.strokeStyle = INK; ctx.lineJoin = 'round'
  ctx.strokeText(text, 0, 0)
  ctx.fillStyle = fill
  ctx.fillText(text, 0, 0)
  ctx.restore()
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
}
