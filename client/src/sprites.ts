// Baked sprites: every static furniture piece and knockable object is drawn
// once, procedurally, into an offscreen canvas. The renderer then blits them
// as billboards — one drawImage per item per frame instead of re-running all
// the path work. Dynamic things (the scuffable couch, the TV static, cats,
// effects) stay live-drawn.

import { INK, fillStroke, outline, halftone } from './comic'
import { FURNITURE, type Furniture, type Rect } from './house'

const COS = Math.cos(Math.PI / 6)

export interface Sprite { img: HTMLCanvasElement; ax: number; ay: number }

const sprites = new Map<string, Sprite>()

/** iso projection local to a sprite: (ax, ay) is the anchor = front-bottom-centre. */
type Iso = (x: number, y: number, z: number) => { sx: number; sy: number }

function bake(w: number, h: number, ax: number, ay: number, draw: (ctx: CanvasRenderingContext2D, iso: Iso) => void): Sprite {
  const img = document.createElement('canvas')
  img.width = Math.ceil(w); img.height = Math.ceil(h)
  const ctx = img.getContext('2d')!
  const iso: Iso = (x, y, z = 0) => ({ sx: ax + (x - y) * COS, sy: ay + (x + y) / 2 - z })
  draw(ctx, iso)
  return { img, ax, ay }
}

function quad(ctx: CanvasRenderingContext2D, pts: { sx: number; sy: number }[]) {
  ctx.beginPath()
  pts.forEach((p, i) => (i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy)))
  ctx.closePath()
}

const WOOD = { top: '#d8b088', s: '#b08a5e', e: '#96744c' }
const WOOD_DARK = { top: '#a0714f', s: '#8a6242', e: '#75543a' }
const WHITE = { top: '#f2f7f8', s: '#d5dee0', e: '#b8c4c7' }

// iso-space helpers — the same art the old renderer used, baked instead
function mk(ctx: CanvasRenderingContext2D, iso: Iso) {
  const box3 = (r: Rect, h: number, c: { top: string; s: string; e: string }, z = 0) => {
    const zt = z + h
    const nw = iso(r.x, r.y, zt), ne = iso(r.x + r.w, r.y, zt)
    const se = iso(r.x + r.w, r.y + r.h, zt), sw = iso(r.x, r.y + r.h, zt)
    const e0 = iso(r.x + r.w, r.y, z), se0 = iso(r.x + r.w, r.y + r.h, z), sw0 = iso(r.x, r.y + r.h, z)
    quad(ctx, [ne, se, se0, e0]); fillStroke(ctx, c.e, 3.5)
    quad(ctx, [sw, se, se0, sw0]); fillStroke(ctx, c.s, 3.5)
    quad(ctx, [nw, ne, se, sw]); fillStroke(ctx, c.top, 3.5)
  }
  const topQuad = (r: Rect, z: number, fill: string, w = 3) => {
    quad(ctx, [iso(r.x, r.y, z), iso(r.x + r.w, r.y, z), iso(r.x + r.w, r.y + r.h, z), iso(r.x, r.y + r.h, z)])
    fillStroke(ctx, fill, w)
  }
  const topEllipse = (x: number, y: number, z: number, r: number, fill: string, lw = 3) => {
    const p = iso(x, y, z)
    ctx.beginPath(); ctx.ellipse(p.sx, p.sy, r * 1.2, r * 0.6, 0, 0, Math.PI * 2)
    fillStroke(ctx, fill, lw)
  }
  const sPt = (r: Rect, u: number, z: number) => iso(r.x + r.w * u, r.y + r.h, z)
  const sLine = (r: Rect, u0: number, z0: number, u1: number, z1: number, w = 2) => {
    const a = sPt(r, u0, z0), b = sPt(r, u1, z1)
    ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy)
    ctx.lineWidth = w; ctx.strokeStyle = INK; ctx.stroke()
  }
  const sDot = (r: Rect, u: number, z: number, rad: number, fill: string) => {
    const p = sPt(r, u, z)
    ctx.beginPath(); ctx.arc(p.sx, p.sy, rad, 0, Math.PI * 2)
    ctx.fillStyle = fill; ctx.fill(); outline(ctx, 1.5)
  }
  return { box3, topQuad, topEllipse, sPt, sLine, sDot }
}

function drawFurnitureInto(ctx: CanvasRenderingContext2D, iso: Iso, f: Furniture) {
  const r = f.rect
  const { box3, topQuad, topEllipse, sPt, sLine, sDot } = mk(ctx, iso)
  switch (f.kind) {
    case 'fridge': {
      box3(r, f.h, WHITE)
      sLine(r, 0.03, 45, 0.97, 45, 2.5)
      sLine(r, 0.86, 20, 0.86, 38, 3)
      sLine(r, 0.86, 52, 0.86, 72, 3)
      for (const [u, z, c] of [[0.25, 66, '#e24141'], [0.55, 26, '#8fb8e8'], [0.4, 14, '#ffd23f']] as const)
        sDot(r, u, z, 4, c)
      break
    }
    case 'counter': {
      box3(r, f.h, WOOD)
      const st = FURNITURE.find((x) => x.id === 'stove')!
      box3(st.rect, st.h, { top: '#4a4a52', s: '#3a3a40', e: '#2e2e34' }, 50)
      for (const [u, v] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]] as const)
        topEllipse(st.rect.x + st.rect.w * u, st.rect.y + st.rect.h * v, 58, 8, '#2b2b30', 2)
      break
    }
    case 'table':
      box3(r, f.h, WOOD)
      topQuad({ x: r.x + 8, y: r.y + 8, w: r.w - 16, h: r.h - 16 }, f.h, '#c99a68', 2)
      break
    case 'bowl': {
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2
      topEllipse(cx, cy, 2, 16, '#e2578a')
      topEllipse(cx, cy, 8, 10, '#8a5a34', 2)
      ctx.fillStyle = '#5e3a1e'
      for (let i = 0; i < 4; i++) {
        const p = iso(cx - 8 + i * 5, cy + (i % 2) * 5, 10)
        ctx.beginPath(); ctx.arc(p.sx, p.sy, 2.2, 0, Math.PI * 2); ctx.fill()
      }
      break
    }
    case 'bed': {
      box3(r, f.h, { top: '#a8c8ea', s: '#8fb0d5', e: '#7a9cc0' })
      box3({ x: r.x + r.w - 14, y: r.y - 4, w: 14, h: r.h + 8 }, 58, WOOD_DARK)
      topQuad({ x: r.x + r.w - 66, y: r.y + 18, w: 44, h: r.h - 36 }, f.h + 4, '#fdf8ee')
      ctx.save()
      quad(ctx, [iso(r.x + 4, r.y + 4, f.h), iso(r.x + r.w - 80, r.y + 4, f.h), iso(r.x + r.w - 80, r.y + r.h - 4, f.h), iso(r.x + 4, r.y + r.h - 4, f.h)])
      ctx.clip()
      ctx.fillStyle = halftone(ctx, '#5a87b8', 9, 1.4)
      ctx.fillRect(0, 0, 3000, 1600)
      ctx.restore()
      break
    }
    case 'dresser': case 'nightstand': {
      box3(r, f.h, WOOD_DARK)
      const rows = f.kind === 'dresser' ? 2 : 1
      for (let i = 1; i <= rows; i++) {
        const z = (f.h / (rows + 1)) * i
        sLine(r, 0.06, z, 0.94, z, 2)
        const knob = sPt(r, 0.5, z - f.h / (rows + 1) / 2)
        ctx.beginPath(); ctx.arc(knob.sx, knob.sy, 3, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill()
      }
      break
    }
    case 'sink': {
      box3(r, f.h, WHITE)
      topEllipse(r.x + r.w / 2, r.y + r.h * 0.62, f.h, 16, '#cfe4ea', 3)
      const p = iso(r.x + r.w / 2, r.y + r.h * 0.25, f.h)
      ctx.beginPath(); ctx.moveTo(p.sx, p.sy); ctx.lineTo(p.sx, p.sy - 12); ctx.lineTo(p.sx + 8, p.sy - 12)
      ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke()
      break
    }
    case 'toilet': {
      box3({ x: r.x + 8, y: r.y + 4, w: r.w - 16, h: 20 }, 52, WHITE)
      box3({ x: r.x + 4, y: r.y + 26, w: r.w - 8, h: r.h - 26 }, f.h, WHITE)
      topEllipse(r.x + r.w / 2, r.y + 26 + (r.h - 26) / 2, f.h, 12, '#9fc8dd', 2)
      break
    }
    case 'tub':
      box3(r, f.h, WHITE)
      topQuad({ x: r.x + 10, y: r.y + 10, w: r.w - 20, h: r.h - 20 }, f.h, '#9fc8dd', 3)
      break
    case 'litter': {
      box3(r, f.h, { top: '#9a9aa2', s: '#8a8a92', e: '#76767e' })
      topQuad({ x: r.x + 8, y: r.y + 8, w: r.w - 16, h: r.h - 16 }, f.h, '#d8cbb0', 2)
      ctx.save()
      quad(ctx, [iso(r.x + 8, r.y + 8, f.h), iso(r.x + r.w - 8, r.y + 8, f.h), iso(r.x + r.w - 8, r.y + r.h - 8, f.h), iso(r.x, r.y + r.h - 8, f.h)])
      ctx.clip()
      ctx.fillStyle = halftone(ctx, '#a89878', 7, 1.8)
      ctx.fillRect(0, 0, 3000, 1600)
      ctx.restore()
      break
    }
    case 'tree': {
      box3({ x: r.x + 4, y: r.y + 10, w: r.w - 8, h: r.h - 20 }, 55, { top: '#7d5a3e', s: '#6b4a30', e: '#5a3d28' })
      const p = iso(r.x + r.w / 2, r.y + r.h / 2, 105)
      ctx.fillStyle = '#7fb356'
      for (const [ox, oy, cr] of [[-40, -15, 40], [30, -25, 44], [0, -55, 46], [-10, 5, 38], [35, 0, 34]] as const) {
        ctx.beginPath(); ctx.arc(p.sx + ox, p.sy + oy, cr, 0, Math.PI * 2); ctx.fill()
      }
      ctx.strokeStyle = INK; ctx.lineWidth = 4
      for (const [ox, oy, cr] of [[-40, -15, 40], [30, -25, 44], [0, -55, 46]] as const) {
        ctx.beginPath(); ctx.arc(p.sx + ox, p.sy + oy, cr, 0.4, 2.8); ctx.stroke()
        ctx.beginPath(); ctx.arc(p.sx + ox, p.sy + oy, cr, 3.4, 5.6); ctx.stroke()
      }
      break
    }
    case 'bush': {
      const p = iso(r.x + r.w / 2, r.y + r.h / 2, 8)
      ctx.fillStyle = '#7fb356'
      for (const [ox, oy, cr] of [[-24, -10, 26], [18, -16, 24], [0, -34, 24], [28, -4, 20]] as const) {
        ctx.beginPath(); ctx.arc(p.sx + ox, p.sy + oy, cr, 0, Math.PI * 2); ctx.fill()
      }
      ctx.strokeStyle = INK; ctx.lineWidth = 3.5
      ctx.beginPath(); ctx.arc(p.sx, p.sy - 10, 34, 3.4, 5.9); ctx.stroke()
      ctx.beginPath(); ctx.arc(p.sx - 20, p.sy - 14, 26, 3.6, 5.4); ctx.stroke()
      break
    }
    case 'birdbath': {
      box3({ x: r.x + r.w / 2 - 7, y: r.y + 10, w: 14, h: r.h - 14 }, 34, { top: '#c8c8d0', s: '#b0b0b8', e: '#9a9aa2' })
      topEllipse(r.x + r.w / 2, r.y + r.h / 2, 38, 20, '#b8b8c0', 3.5)
      topEllipse(r.x + r.w / 2, r.y + r.h / 2, 40, 12, '#9fc8dd', 2)
      break
    }
    case 'coffeetable':
      box3(r, f.h, WOOD_DARK)
      topQuad({ x: r.x + 6, y: r.y + 6, w: r.w - 12, h: r.h - 12 }, f.h, '#b08255', 2)
      break
    case 'bookshelf': {
      box3(r, f.h, WOOD_DARK)
      const cols = ['#e24141', '#ffd23f', '#8fb8e8', '#7fb356', '#e2578a', '#f0943c']
      for (let i = 0; i < 9; i++) {
        const u0 = 0.06 + i * 0.1, u1 = u0 + 0.08
        const bh = 26 + ((i * 13) % 16)
        quad(ctx, [sPt(r, u0, 6 + bh), sPt(r, u1, 6 + bh), sPt(r, u1, 6), sPt(r, u0, 6)])
        ctx.fillStyle = cols[i % cols.length]; ctx.fill()
        outline(ctx, 2)
      }
      break
    }
    case 'post': {
      const post: Rect = { x: r.x + 16, y: r.y + 12, w: 22, h: 22 }
      box3({ x: r.x, y: r.y + 20, w: r.w, h: r.h - 20 }, 10, WOOD)
      box3(post, 52, { top: '#b89a6e', s: '#a88a5e', e: '#8a704a' }, 10)
      for (let z = 18; z < 58; z += 7) sLine(post, 0, z, 1, z, 1.6)
      break
    }
    case 'plant': {
      box3({ x: r.x + 8, y: r.y + 26, w: r.w - 16, h: r.h - 30 }, f.h, { top: '#d98a5a', s: '#c97b4a', e: '#a86238' })
      const p = iso(r.x + r.w / 2, r.y + r.h / 2 + 8, f.h + 8)
      ctx.fillStyle = '#5e9e4a'
      for (const a of [-1.3, -0.6, 0.1, 0.8]) {
        ctx.save(); ctx.translate(p.sx, p.sy); ctx.rotate(a)
        ctx.beginPath(); ctx.ellipse(0, -22, 8, 24, 0, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      }
      ctx.strokeStyle = INK; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.ellipse(p.sx - 12, p.sy - 30, 8, 20, -0.6, 3.4, 5.8); ctx.stroke()
      ctx.beginPath(); ctx.ellipse(p.sx + 10, p.sy - 32, 8, 20, 0.3, 3.8, 5.9); ctx.stroke()
      break
    }
  }
}

function drawObjectInto(ctx: CanvasRenderingContext2D, kind: string) {
  // objects are baked drawn around (0,0) with the base at ~y+10
  switch (kind) {
    case 'vase':
      ctx.beginPath(); ctx.moveTo(-8, -14); ctx.bezierCurveTo(-16, -4, -14, 10, 0, 10); ctx.bezierCurveTo(14, 10, 16, -4, 8, -14); ctx.closePath()
      fillStroke(ctx, '#8fb8e8', 3)
      ctx.fillStyle = '#e2578a'
      for (const dx of [-4, 2]) { ctx.beginPath(); ctx.arc(dx, -20 - dx, 4, 0, Math.PI * 2); ctx.fill(); outline(ctx, 1.5) }
      break
    case 'cup': case 'mug':
      ctx.beginPath(); ctx.rect(-8, -8, 16, 16)
      fillStroke(ctx, kind === 'mug' ? '#e24141' : '#8fb8e8', 3)
      ctx.beginPath(); ctx.arc(11, 0, 5, -1.2, 1.2); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke()
      break
    case 'frame':
      ctx.save(); ctx.rotate(-0.15)
      ctx.beginPath(); ctx.rect(-10, -12, 20, 24)
      fillStroke(ctx, '#c49a6c', 3)
      ctx.beginPath(); ctx.rect(-6, -8, 12, 16)
      ctx.fillStyle = '#e8dfc8'; ctx.fill(); outline(ctx, 1.5)
      ctx.beginPath(); ctx.arc(0, -2, 4, 0, Math.PI * 2); ctx.fillStyle = '#8a6a4a'; ctx.fill()
      ctx.restore()
      break
    case 'books': {
      const cols = ['#e24141', '#7fb356', '#8fb8e8']
      for (let i = 0; i < 3; i++) {
        ctx.save(); ctx.translate(0, -i * 8); ctx.rotate((i - 1) * 0.08)
        ctx.beginPath(); ctx.rect(-14, -6, 28, 7)
        fillStroke(ctx, cols[i], 2)
        ctx.restore()
      }
      break
    }
    case 'tp':
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2)
      fillStroke(ctx, '#fff', 3)
      ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#c4a172'; ctx.fill(); outline(ctx, 1.5)
      ctx.beginPath(); ctx.moveTo(8, 4); ctx.lineTo(16, 10); ctx.lineTo(12, 14); ctx.lineTo(6, 8); ctx.closePath()
      ctx.fillStyle = '#fff'; ctx.fill(); outline(ctx, 1.5)
      break
    case 'lamp':
      ctx.fillStyle = '#4a4a52'; ctx.fillRect(-3, -16, 6, 20)
      ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.strokeRect(-3, -16, 6, 20)
      ctx.beginPath(); ctx.moveTo(-14, -30); ctx.lineTo(14, -30); ctx.lineTo(9, -14); ctx.lineTo(-9, -14); ctx.closePath()
      fillStroke(ctx, '#ffd23f', 3)
      break
  }
}

// furniture that must stay live-drawn (has dynamic state)
export const LIVE_FURNITURE = new Set(['couch', 'tvstand'])

export function spriteFor(id: string): Sprite {
  let s = sprites.get(id)
  if (s) return s

  const f = FURNITURE.find((x) => x.id === id)
  if (f) {
    const r = f.rect
    const W = (r.w + r.h) * 0.9 + 160
    const H = (r.w + r.h) / 2 + f.h + 220
    // anchor = the item's front-bottom-centre — the "feet" point the
    // billboard is planted on in the 3D view
    const ax0 = r.x + r.w / 2, ay0 = r.y + r.h
    s = bake(W, H, W / 2, H - 80, (ctx) => {
      const iso: Iso = (x, y, z = 0) => ({
        sx: W / 2 + ((x - ax0) - (y - ay0)) * COS,
        sy: H - 80 + ((x - ax0) + (y - ay0)) / 2 - z,
      })
      drawFurnitureInto(ctx, iso, f)
    })
  } else {
    s = bake(96, 96, 48, 70, (ctx) => {
      ctx.translate(48, 70)
      drawObjectInto(ctx, id)
    })
  }
  sprites.set(id, s)
  return s
}
