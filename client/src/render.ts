// World renderer: floors, walls, furniture, knockable objects, cats, fx.
// Everything is procedural comic art — flat fills, fat outlines, halftone.

import { INK, fillStroke, outline, halftone, roundRect, ellipse, promptBubble } from './comic'
import { ROOMS, WALLS, FURNITURE, OBJECTS, WORLD, type Furniture, type InteractTarget } from './house'
import { drawCat } from './catdraw'
import { drawFx } from './effects'
import type { CatCustom, Facing, Pose } from './types'

export interface RenderCat {
  id: string; name: string; cat: CatCustom
  x: number; y: number; facing: Facing; pose: Pose; phase: number
}

export interface RenderState {
  cats: RenderCat[]
  objects: Record<string, string>
  toggles: Record<string, boolean>
  damageCouch: number
  lasers: { x: number; y: number }[]
  time: number
  nearBirdbath: number
  interact: InteractTarget | null
  myId: string
}

// deterministic garden clutter
const tufts = Array.from({ length: 60 }, (_, i) => ({
  x: 80 + ((i * 137) % 440), y: 740 + ((i * 211) % 340), s: (i * 7) % 3,
}))
const flowers = Array.from({ length: 14 }, (_, i) => ({
  x: 90 + ((i * 173) % 420), y: 750 + ((i * 97) % 320),
  c: ['#e2578a', '#ffd23f', '#8fb8e8'][i % 3],
}))

export function render(ctx: CanvasRenderingContext2D, s: RenderState) {
  drawFloors(ctx)
  drawDoors(ctx)
  drawWindows(ctx, s.time)
  // flat floor decor (rugs, runners) sits under everything else
  for (const f of FURNITURE) if (f.flat) drawFurniture(ctx, f, s)

  // painter's sort: furniture + cats + objects by baseline y
  interface Item { y: number; draw: () => void }
  const items: Item[] = []
  for (const f of FURNITURE) {
    if (f.flat) continue
    items.push({ y: f.rect.y + f.rect.h, draw: () => drawFurniture(ctx, f, s) })
  }
  for (const o of OBJECTS) {
    if (o.kind === 'tvscreen') continue // drawn inside the tv stand
    const state = s.objects[o.id] ?? 'ok'
    if (o.kind === 'lamp') items.push({ y: o.y + 12, draw: () => drawLamp(ctx, o.x, o.y, s.toggles[o.id] ?? false) })
    else if (state !== 'broken') items.push({ y: o.y + 12, draw: () => drawObject(ctx, o.kind, o.x, o.y) })
  }
  for (const c of s.cats) {
    items.push({ y: c.y + 15, draw: () => drawCatWithName(ctx, c, s.myId) })
  }
  items.sort((a, b) => a.y - b.y)
  for (const it of items) it.draw()

  // ambient bird on the birdbath — flees when cats get close
  drawBird(ctx, s.time, s.nearBirdbath)

  // laser dots over everything on the floor
  for (const l of s.lasers) drawLaser(ctx, l.x, l.y, s.time)

  drawWalls(ctx)
  drawFx(ctx)

  if (s.interact) promptBubble(ctx, s.interact.x, s.interact.y - 30, s.interact.prompt)
}

// -------------------------------------------------------------- cats -----

function drawCatWithName(ctx: CanvasRenderingContext2D, c: RenderCat, myId: string) {
  drawCat(ctx, c.x, c.y, c.cat, c.facing, c.pose, c.phase)
  // little name tag above
  ctx.save()
  ctx.font = '700 13px Bangers, Impact, sans-serif'
  const w = ctx.measureText(c.name).width + 14
  const y = c.y - (c.pose === 'sleep' ? 30 : 44)
  ctx.beginPath(); roundRect(ctx, c.x - w / 2, y, w, 17, 5)
  ctx.fillStyle = c.id === myId ? '#ffd23f' : '#fff'
  ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = 1
  ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke()
  ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(c.name, c.x, y + 9)
  ctx.restore()
}

// ------------------------------------------------------------- floors ----

function drawFloors(ctx: CanvasRenderingContext2D) {
  // paper-coloured world base
  ctx.fillStyle = '#e8dfc8'
  ctx.fillRect(0, 0, WORLD.w, WORLD.h)
  for (const r of ROOMS) {
    const { rect } = r
    if (r.floor === 'tile' || r.floor === 'bath') {
      ctx.fillStyle = r.floor === 'tile' ? '#f2e9d5' : '#dcecf2'
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
      ctx.strokeStyle = r.floor === 'tile' ? '#d8cbb0' : '#b8d4e0'
      ctx.lineWidth = 2
      for (let x = rect.x; x <= rect.x + rect.w; x += 40) { ctx.beginPath(); ctx.moveTo(x, rect.y); ctx.lineTo(x, rect.y + rect.h); ctx.stroke() }
      for (let y = rect.y; y <= rect.y + rect.h; y += 40) { ctx.beginPath(); ctx.moveTo(rect.x, y); ctx.lineTo(rect.x + rect.w, y); ctx.stroke() }
    } else if (r.floor === 'wood') {
      ctx.fillStyle = '#d9b98a'
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
      ctx.strokeStyle = '#c4a172'; ctx.lineWidth = 2
      for (let y = rect.y + 22; y < rect.y + rect.h; y += 44) { ctx.beginPath(); ctx.moveTo(rect.x, y); ctx.lineTo(rect.x + rect.w, y); ctx.stroke() }
      ctx.strokeStyle = '#b8906022'
      for (let y = rect.y + 44; y < rect.y + rect.h; y += 88) {
        for (let x = rect.x + ((y * 7) % 120); x < rect.x + rect.w; x += 160) {
          ctx.beginPath(); ctx.moveTo(x, y - 44); ctx.lineTo(x, y); ctx.stroke()
        }
      }
    } else if (r.floor === 'carpet') {
      ctx.fillStyle = '#e8b8c0'
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
      ctx.fillStyle = halftone(ctx, '#c98a96', 10, 1.6)
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
    } else if (r.floor === 'grass') {
      ctx.fillStyle = '#a8d47a'
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
      ctx.strokeStyle = '#7fb356'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
      for (const t of tufts) {
        ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x - 3, t.y - 7 - t.s); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(t.x + 4, t.y); ctx.lineTo(t.x + 6, t.y - 6 - t.s); ctx.stroke()
      }
      for (const f of flowers) {
        ctx.fillStyle = f.c
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2
          ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * 4, f.y + Math.sin(a) * 4, 2.8, 0, Math.PI * 2); ctx.fill()
        }
        ctx.beginPath(); ctx.arc(f.x, f.y, 2.5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill()
        outline(ctx, 1.5)
      }
    }
    // room name watermark
    ctx.save()
    ctx.font = '400 44px Bangers, Impact, sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.globalAlpha = 0.10
    ctx.fillStyle = INK
    ctx.fillText(r.name.toUpperCase(), rect.x + rect.w / 2, rect.y + rect.h / 2)
    ctx.restore()
  }
}

function drawWalls(ctx: CanvasRenderingContext2D) {
  for (const w of WALLS) {
    ctx.fillStyle = '#6b5a4a'
    ctx.fillRect(w.x, w.y, w.w, w.h)
    ctx.strokeStyle = INK; ctx.lineWidth = 3.5
    ctx.strokeRect(w.x, w.y, w.w, w.h)
    // brick hatching
    ctx.strokeStyle = 'rgba(20,16,12,0.25)'; ctx.lineWidth = 1.5
    const step = 26
    for (let x = w.x + step; x < w.x + w.w; x += step) { ctx.beginPath(); ctx.moveTo(x, w.y + 2); ctx.lineTo(x, w.y + w.h - 2); ctx.stroke() }
    for (let y = w.y + step; y < w.y + w.h; y += step) { ctx.beginPath(); ctx.moveTo(w.x + 2, y); ctx.lineTo(w.x + w.w - 2, y); ctx.stroke() }
  }
}

function drawDoors(ctx: CanvasRenderingContext2D) {
  // threshold planks in each doorway gap so openings read clearly
  const gaps: [number, number, number, number][] = [
    [540, 200, 20, 90], [540, 520, 20, 90], [540, 880, 20, 90],
    [740, 200, 20, 90], [740, 700, 20, 90],
    [280, 440, 100, 20], [280, 700, 100, 20], [1100, 440, 100, 20],
  ]
  for (const [x, y, w, h] of gaps) {
    ctx.fillStyle = '#c4a172'
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = INK; ctx.lineWidth = 2
    ctx.strokeRect(x, y, w, h)
  }
}

function drawWindows(ctx: CanvasRenderingContext2D, time: number) {
  const wins: [number, number, number, number][] = [
    [260, 44, 120, 14],   // kitchen top wall
    [1560, 44, 60, 14],   // bedroom top-right... actually on top wall
    [1624, 560, 14, 140], // living right wall
  ]
  void time
  for (const [x, y, w, h] of wins) {
    ctx.fillStyle = '#bcdcf0'
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h)
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(x + w * 0.3, y + 2); ctx.lineTo(x + w * 0.15, y + h - 2); ctx.stroke()
  }
}

// ---------------------------------------------------------- furniture ----

function drawFurniture(ctx: CanvasRenderingContext2D, f: Furniture, s: RenderState) {
  const r = f.rect
  switch (f.kind) {
    case 'fridge': {
      box(ctx, r, '#dfe8ea')
      ctx.strokeStyle = INK; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(r.x, r.y + 40); ctx.lineTo(r.x + r.w, r.y + 40); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(r.x + r.w - 14, r.y + 10); ctx.lineTo(r.x + r.w - 14, r.y + 30); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(r.x + r.w - 14, r.y + 50); ctx.lineTo(r.x + r.w - 14, r.y + 80); ctx.stroke()
      // magnets!
      for (const [mx, my, c] of [[20, 20, '#e24141'], [45, 60, '#8fb8e8'], [30, 85, '#ffd23f']] as const) {
        ctx.beginPath(); ctx.arc(r.x + mx, r.y + my, 4, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); outline(ctx, 1.5)
      }
      break
    }
    case 'counter': box(ctx, r, '#c49a6c'); topEdge(ctx, r); break
    case 'stove': {
      box(ctx, r, '#4a4a52')
      for (const [bx, by] of [[22, 12], [72, 12], [22, 30], [72, 30]] as const) {
        ctx.beginPath(); ctx.arc(r.x + bx, r.y + by, 8, 0, Math.PI * 2)
        ctx.fillStyle = '#2b2b30'; ctx.fill(); outline(ctx, 2)
      }
      break
    }
    case 'table': {
      box(ctx, r, '#c49a6c')
      ctx.fillStyle = '#b8895a'; ctx.fillRect(r.x + 8, r.y + 8, r.w - 16, r.h - 16)
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(r.x + 8, r.y + 8, r.w - 16, r.h - 16)
      break
    }
    case 'bowl': {
      ellipse(ctx, r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2)
      fillStroke(ctx, '#e2578a', 3)
      ellipse(ctx, r.x + r.w / 2, r.y + r.h / 2 - 1, r.w / 2 - 7, r.h / 2 - 6)
      fillStroke(ctx, '#8a5a34', 2) // kibble
      ctx.fillStyle = '#5e3a1e'
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(r.x + 10 + i * 6, r.y + 10 + (i % 2) * 6, 2.4, 0, Math.PI * 2); ctx.fill() }
      break
    }
    case 'bed': {
      box(ctx, r, '#8fb8e8')
      // headboard
      ctx.fillStyle = '#7a5a40'; ctx.fillRect(r.x + r.w - 22, r.y - 6, 22, r.h + 12)
      ctx.strokeStyle = INK; ctx.lineWidth = 3.5; ctx.strokeRect(r.x + r.w - 22, r.y - 6, 22, r.h + 12)
      // pillow
      ctx.beginPath(); roundRect(ctx, r.x + r.w - 70, r.y + 14, 44, r.h - 28, 10)
      fillStroke(ctx, '#fdf8ee', 3)
      // blanket w/ halftone
      ctx.fillStyle = halftone(ctx, '#5a87b8', 9, 1.4)
      ctx.fillRect(r.x + 4, r.y + 4, r.w - 100, r.h - 8)
      break
    }
    case 'dresser': case 'nightstand': {
      box(ctx, r, '#a0714f')
      ctx.strokeStyle = INK; ctx.lineWidth = 2
      const rows = f.kind === 'dresser' ? 2 : 1
      for (let i = 1; i <= rows; i++) {
        const ly = r.y + (r.h / (rows + 1)) * i
        ctx.beginPath(); ctx.moveTo(r.x + 6, ly); ctx.lineTo(r.x + r.w - 6, ly); ctx.stroke()
        ctx.beginPath(); ctx.arc(r.x + r.w / 2, ly - 8, 3, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill()
      }
      break
    }
    case 'rug': case 'runner': {
      ctx.beginPath(); roundRect(ctx, r.x, r.y, r.w, r.h, 14)
      fillStroke(ctx, f.kind === 'runner' ? '#b8524a' : '#d4a04e', 3.5)
      ctx.beginPath(); roundRect(ctx, r.x + 10, r.y + 10, r.w - 20, r.h - 20, 10)
      ctx.fillStyle = halftone(ctx, 'rgba(20,16,12,0.35)', 7, 1.3); ctx.fill()
      ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke()
      break
    }
    case 'sink': {
      box(ctx, r, '#eef4f6')
      ellipse(ctx, r.x + r.w / 2, r.y + r.h / 2 + 6, 24, 16)
      fillStroke(ctx, '#cfe4ea', 3)
      ctx.beginPath(); ctx.moveTo(r.x + r.w / 2, r.y + r.h / 2 - 16); ctx.lineTo(r.x + r.w / 2, r.y + r.h / 2 - 26); ctx.lineTo(r.x + r.w / 2 + 10, r.y + r.h / 2 - 26)
      ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke()
      break
    }
    case 'toilet': {
      ellipse(ctx, r.x + r.w / 2, r.y + r.h - 22, 22, 20)
      fillStroke(ctx, '#eef4f6', 3)
      ellipse(ctx, r.x + r.w / 2, r.y + r.h - 22, 12, 10)
      fillStroke(ctx, '#9fc8dd', 2)
      box(ctx, { x: r.x + 6, y: r.y, w: r.w - 12, h: 22 }, '#eef4f6')
      break
    }
    case 'tub': {
      ctx.beginPath(); roundRect(ctx, r.x, r.y, r.w, r.h, 18)
      fillStroke(ctx, '#eef4f6', 4)
      ctx.beginPath(); roundRect(ctx, r.x + 12, r.y + 12, r.w - 24, r.h - 24, 12)
      fillStroke(ctx, '#9fc8dd', 3)
      break
    }
    case 'litter': {
      ctx.beginPath(); roundRect(ctx, r.x, r.y, r.w, r.h, 8)
      fillStroke(ctx, '#8a8a92', 3.5)
      ctx.beginPath(); roundRect(ctx, r.x + 8, r.y + 8, r.w - 16, r.h - 16, 6)
      ctx.fillStyle = '#d8cbb0'; ctx.fill()
      ctx.fillStyle = halftone(ctx, '#a89878', 7, 1.8)
      ctx.fillRect(r.x + 8, r.y + 8, r.w - 16, r.h - 16)
      ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke()
      break
    }
    case 'tree': {
      const cx = r.x + r.w / 2, ty = r.y - 60
      ctx.fillStyle = '#6b4a30'
      ctx.fillRect(r.x + 4, r.y - 40, r.w - 8, r.h + 40)
      ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.strokeRect(r.x + 4, r.y - 40, r.w - 8, r.h + 40)
      // scribbly canopy
      ctx.fillStyle = '#7fb356'
      for (const [ox, oy, cr] of [[-40, -30, 42], [30, -40, 46], [0, -70, 48], [-15, -15, 40], [35, -10, 38]] as const) {
        ctx.beginPath(); ctx.arc(cx + ox, ty + oy, cr, 0, Math.PI * 2); ctx.fill()
      }
      ctx.strokeStyle = INK; ctx.lineWidth = 4
      for (const [ox, oy, cr] of [[-40, -30, 42], [30, -40, 46], [0, -70, 48]] as const) {
        ctx.beginPath(); ctx.arc(cx + ox, ty + oy, cr, 0.6, 2.6); ctx.stroke()
        ctx.beginPath(); ctx.arc(cx + ox, ty + oy, cr, 3.6, 5.4); ctx.stroke()
      }
      break
    }
    case 'bush': {
      ctx.fillStyle = '#7fb356'
      for (const [ox, oy, cr] of [[0, 10, 26], [22, 6, 22], [-22, 8, 22], [10, -8, 20]] as const) {
        ctx.beginPath(); ctx.arc(r.x + r.w / 2 + ox, r.y + r.h / 2 + oy, cr, 0, Math.PI * 2); ctx.fill()
      }
      ctx.strokeStyle = INK; ctx.lineWidth = 3.5
      ctx.beginPath(); ctx.arc(r.x + r.w / 2, r.y + r.h / 2, 30, -0.4, Math.PI * 1.1); ctx.stroke()
      ctx.beginPath(); ctx.arc(r.x + r.w / 2 + 18, r.y + r.h / 2 - 6, 24, -0.8, 1.4); ctx.stroke()
      break
    }
    case 'birdbath': {
      ctx.fillStyle = '#b8b8c0'
      ctx.fillRect(r.x + r.w / 2 - 7, r.y + 12, 14, r.h - 12)
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(r.x + r.w / 2 - 7, r.y + 12, 14, r.h - 12)
      ellipse(ctx, r.x + r.w / 2, r.y + 12, r.w / 2, 13)
      fillStroke(ctx, '#b8b8c0', 3.5)
      ellipse(ctx, r.x + r.w / 2, r.y + 10, r.w / 2 - 8, 7)
      ctx.fillStyle = '#9fc8dd'; ctx.fill(); outline(ctx, 2)
      break
    }
    case 'tvstand': {
      box(ctx, r, '#8a6a4a')
      const on = s.toggles['tv1'] ?? false
      ctx.beginPath(); ctx.rect(r.x + 20, r.y - 38, r.w - 40, 42)
      fillStroke(ctx, '#2b2b30', 4)
      ctx.beginPath(); ctx.rect(r.x + 26, r.y - 32, r.w - 52, 30)
      if (on) {
        ctx.fillStyle = '#9fc8dd'; ctx.fill()
        // static noise
        const n = Math.floor(s.time * 12) % 3
        ctx.fillStyle = ['#ffffff55', '#ffffff22', '#00000033'][n]
        for (let i = 0; i < 24; i++) {
          const px = r.x + 26 + ((i * 37 + n * 53) % (r.w - 58))
          const py = r.y - 32 + ((i * 23 + n * 31) % 28)
          ctx.fillRect(px, py, 5, 3)
        }
      } else {
        ctx.fillStyle = '#14100c'; ctx.fill()
        ctx.strokeStyle = '#ffffff44'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(r.x + 34, r.y - 28); ctx.lineTo(r.x + 50, r.y - 6); ctx.stroke()
      }
      break
    }
    case 'couch': {
      box(ctx, r, '#c95f6a')
      // arms + back + cushion seams
      ctx.fillStyle = '#a8454f'
      ctx.fillRect(r.x, r.y, r.w, 16) // backrest (top)
      ctx.fillRect(r.x, r.y, 20, r.h)
      ctx.fillRect(r.x + r.w - 20, r.y, 20, r.h)
      ctx.strokeStyle = INK; ctx.lineWidth = 3
      ctx.strokeRect(r.x, r.y, r.w, 16); ctx.strokeRect(r.x, r.y, 20, r.h); ctx.strokeRect(r.x + r.w - 20, r.y, 20, r.h)
      ctx.beginPath(); ctx.moveTo(r.x + r.w / 2, r.y + 16); ctx.lineTo(r.x + r.w / 2, r.y + r.h); ctx.stroke()
      // accumulated scratch damage!
      const n = s.damageCouch
      ctx.strokeStyle = '#7a3238'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'
      for (let i = 0; i < n; i++) {
        const sx = r.x + 30 + ((i * 61) % (r.w - 70))
        const sy = r.y + 24 + ((i * 37) % (r.h - 36))
        for (let k = 0; k < 3; k++) {
          ctx.beginPath(); ctx.moveTo(sx + k * 6, sy); ctx.lineTo(sx + k * 6 - 8, sy + 10); ctx.stroke()
        }
      }
      break
    }
    case 'coffeetable': box(ctx, r, '#a0714f'); topEdge(ctx, r); break
    case 'bookshelf': {
      box(ctx, r, '#7a5a40')
      const cols = ['#e24141', '#ffd23f', '#8fb8e8', '#7fb356', '#e2578a', '#f0943c']
      for (let i = 0; i < 9; i++) {
        const bx = r.x + 10 + i * 20, bh = 34 + ((i * 13) % 12)
        ctx.fillStyle = cols[i % cols.length]
        ctx.fillRect(bx, r.y + r.h - 8 - bh, 16, bh)
        ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(bx, r.y + r.h - 8 - bh, 16, bh)
      }
      break
    }
    case 'post': {
      box(ctx, r, '#c4a172')
      ctx.fillStyle = '#a88a5e'; ctx.fillRect(r.x + 18, r.y - 40, 20, 46)
      ctx.strokeStyle = INK; ctx.lineWidth = 3.5; ctx.strokeRect(r.x + 18, r.y - 40, 20, 46)
      ctx.lineWidth = 1.8; ctx.strokeStyle = '#7a5f3a'
      for (let y = r.y - 36; y < r.y + 4; y += 7) { ctx.beginPath(); ctx.moveTo(r.x + 18, y); ctx.lineTo(r.x + 38, y); ctx.stroke() }
      break
    }
    case 'plant': {
      // leaves first, then pot over the bottom
      ctx.fillStyle = '#5e9e4a'
      for (const a of [-1.2, -0.5, 0.2, 0.9]) {
        ctx.save(); ctx.translate(r.x + r.w / 2, r.y + 20); ctx.rotate(a)
        ctx.beginPath(); ctx.ellipse(0, -22, 8, 24, 0, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      }
      ctx.strokeStyle = INK; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(r.x + r.w / 2 - 20, r.y + 26); ctx.lineTo(r.x + r.w / 2 - 14, r.y + r.h); ctx.lineTo(r.x + r.w / 2 + 14, r.y + r.h); ctx.lineTo(r.x + r.w / 2 + 20, r.y + 26); ctx.closePath()
      fillStroke(ctx, '#c97b4a', 3.5)
      break
    }
  }
}

function box(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, fill: string) {
  ctx.beginPath(); roundRect(ctx, r.x, r.y, r.w, r.h, 6)
  fillStroke(ctx, fill, 4)
}

function topEdge(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number }) {
  ctx.strokeStyle = 'rgba(20,16,12,0.3)'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(r.x + 6, r.y + 10); ctx.lineTo(r.x + r.w - 6, r.y + 10); ctx.stroke()
}

// ------------------------------------------------------------- objects ---

function drawObject(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number) {
  ctx.save(); ctx.translate(x, y)
  switch (kind) {
    case 'vase':
      ctx.beginPath(); ctx.moveTo(-8, -14); ctx.bezierCurveTo(-16, -4, -14, 10, 0, 10); ctx.bezierCurveTo(14, 10, 16, -4, 8, -14); ctx.closePath()
      fillStroke(ctx, '#8fb8e8', 3)
      ctx.fillStyle = '#e2578a'
      for (const dx of [-4, 2]) { ctx.beginPath(); ctx.arc(dx, -20 - dx, 4, 0, Math.PI * 2); ctx.fill(); outline(ctx, 1.5) }
      break
    case 'cup': case 'mug':
      ctx.beginPath(); roundRect(ctx, -8, -8, 16, 16, 3)
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
  }
  ctx.restore()
}

function drawLamp(ctx: CanvasRenderingContext2D, x: number, y: number, on: boolean) {
  if (on) {
    const g = ctx.createRadialGradient(x, y - 16, 6, x, y - 16, 120)
    g.addColorStop(0, 'rgba(255,220,110,0.5)')
    g.addColorStop(1, 'rgba(255,220,110,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(x, y - 16, 120, 0, Math.PI * 2); ctx.fill()
  }
  ctx.save(); ctx.translate(x, y)
  ctx.fillStyle = '#4a4a52'; ctx.fillRect(-3, -16, 6, 20)
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.strokeRect(-3, -16, 6, 20)
  ctx.beginPath(); ctx.moveTo(-14, -30); ctx.lineTo(14, -30); ctx.lineTo(9, -14); ctx.lineTo(-9, -14); ctx.closePath()
  fillStroke(ctx, on ? '#ffd23f' : '#b8a888', 3)
  ctx.restore()
}

// -------------------------------------------------------------- critters -

function drawBird(ctx: CanvasRenderingContext2D, time: number, nearDist: number) {
  const cycle = time % 24
  if (cycle > 8) return
  const bx = 352, by = 806
  const fleeing = nearDist < 110
  const fly = fleeing ? Math.min(1, (time * 4) % 1) * 160 : 0
  const bop = Math.sin(time * 6) * 2
  ctx.save()
  ctx.translate(bx + fly * 0.7, by - 14 - bop - fly * 1.4)
  ctx.globalAlpha = Math.max(0, 1 - fly / 160)
  ctx.beginPath(); ctx.ellipse(0, 0, 9, 7, 0, 0, Math.PI * 2)
  fillStroke(ctx, '#8fb8e8', 2.5)
  ctx.beginPath(); ctx.arc(8, -5, 5, 0, Math.PI * 2); fillStroke(ctx, '#8fb8e8', 2)
  ctx.beginPath(); ctx.moveTo(12, -5); ctx.lineTo(17, -4); ctx.lineTo(12, -2); ctx.closePath()
  ctx.fillStyle = '#f0a03c'; ctx.fill()
  ctx.beginPath(); ctx.arc(9, -6, 1.4, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill()
  if (fleeing) { // flap!
    ctx.beginPath(); ctx.moveTo(-4, -4); ctx.quadraticCurveTo(-16, -16 + Math.sin(time * 40) * 6, -20, -8)
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke()
  }
  ctx.restore()
}

function drawLaser(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  const jitter = 2
  const jx = x + Math.sin(time * 31) * jitter, jy = y + Math.cos(time * 37) * jitter
  const g = ctx.createRadialGradient(jx, jy, 1, jx, jy, 22)
  g.addColorStop(0, 'rgba(255,40,40,0.55)')
  g.addColorStop(1, 'rgba(255,40,40,0)')
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(jx, jy, 22, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(jx, jy, 4.5, 0, Math.PI * 2)
  ctx.fillStyle = '#ff2828'; ctx.fill()
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke()
}
