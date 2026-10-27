// World renderer — isometric edition. The world is still flat top-down x/y;
// everything here just projects it into a dimetric view. Boxes extrude into
// top + south + east faces; cats and small objects stay upright billboards.
//
// Depth sort: a point is in front of a box iff it's south of the box's south
// edge OR east of its east edge — which is exactly how our wall/floor planes
// divide space, so layering is correct for walls, furniture and cats alike.

import { INK, fillStroke, outline, halftone, promptBubble } from './comic'
import { ROOMS, WALLS, FURNITURE, OBJECTS, furnitureAt, type Furniture, type InteractTarget, type Rect } from './house'
import { iso, ISO_COS, type ScreenPt } from './iso'
import { drawCat } from './catdraw'
import { drawFx } from './effects'
import type { CatCustom, Facing, Pose } from './types'

export interface RenderCat {
  id: string; name: string; cat: CatCustom
  x: number; y: number; z: number; facing: Facing; pose: Pose; phase: number
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

// ------------------------------------------------------- iso helpers -----

function quad(ctx: CanvasRenderingContext2D, pts: ScreenPt[]) {
  ctx.beginPath()
  pts.forEach((p, i) => (i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy)))
  ctx.closePath()
}

/** An extruded box: light top, mid south face, dark east face. */
function box3(ctx: CanvasRenderingContext2D, r: Rect, h: number, c: { top: string; s: string; e: string }, z = 0) {
  const zt = z + h
  const nw = iso(r.x, r.y, zt), ne = iso(r.x + r.w, r.y, zt)
  const se = iso(r.x + r.w, r.y + r.h, zt), sw = iso(r.x, r.y + r.h, zt)
  const e0 = iso(r.x + r.w, r.y, z), se0 = iso(r.x + r.w, r.y + r.h, z), sw0 = iso(r.x, r.y + r.h, z)
  quad(ctx, [ne, se, se0, e0]); fillStroke(ctx, c.e, 3.5)      // east face
  quad(ctx, [sw, se, se0, sw0]); fillStroke(ctx, c.s, 3.5)    // south face
  quad(ctx, [nw, ne, se, sw]); fillStroke(ctx, c.top, 3.5)    // top
}

/** Flat quad on a horizontal plane (rugs, thresholds, tabletops). */
function topQuad(ctx: CanvasRenderingContext2D, r: Rect, z: number, fill: string, w = 3) {
  quad(ctx, [iso(r.x, r.y, z), iso(r.x + r.w, r.y, z), iso(r.x + r.w, r.y + r.h, z), iso(r.x, r.y + r.h, z)])
  fillStroke(ctx, fill, w)
}

/** A circle lying on a horizontal plane. */
function topEllipse(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, r: number, fill: string, lw = 3) {
  const p = iso(x, y, z)
  ctx.beginPath(); ctx.ellipse(p.sx, p.sy, r * 1.2, r * 0.6, 0, 0, Math.PI * 2)
  fillStroke(ctx, fill, lw)
}

const sPt = (r: Rect, u: number, z: number) => iso(r.x + r.w * u, r.y + r.h, z)  // on south face
const tPt = (r: Rect, u: number, v: number, z: number) => iso(r.x + r.w * u, r.y + r.h * v, z) // on top plane

function sLine(ctx: CanvasRenderingContext2D, r: Rect, u0: number, z0: number, u1: number, z1: number, w = 2) {
  const a = sPt(r, u0, z0), b = sPt(r, u1, z1)
  ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy)
  ctx.lineWidth = w; ctx.strokeStyle = INK; ctx.stroke()
}
function sDot(ctx: CanvasRenderingContext2D, r: Rect, u: number, z: number, rad: number, fill: string) {
  const p = sPt(r, u, z)
  ctx.beginPath(); ctx.arc(p.sx, p.sy, rad, 0, Math.PI * 2)
  ctx.fillStyle = fill; ctx.fill(); outline(ctx, 1.5)
}

// ------------------------------------------------------------- render ----

export function render(ctx: CanvasRenderingContext2D, s: RenderState) {
  drawBase(ctx)
  drawFloors(ctx)
  drawThresholds(ctx)
  // flat floor decor (rugs, runners) sits under everything else
  for (const f of FURNITURE) if (f.flat) drawFlat(ctx, f)

  interface Item { r?: Rect; x: number; y: number; draw: () => void }
  const items: Item[] = []
  for (const f of FURNITURE) {
    if (f.flat || f.kind === 'stove') continue // stove is drawn inside the counter
    items.push({ r: f.rect, x: 0, y: 0, draw: () => drawFurniture(ctx, f, s) })
  }
  for (const w of WALLS) {
    items.push({ r: w, x: 0, y: 0, draw: () => drawWall(ctx, w, s) })
  }
  for (const o of OBJECTS) {
    if (o.kind === 'tvscreen') continue // drawn inside the tv stand
    const state = s.objects[o.id] ?? 'ok'
    if (o.kind === 'lamp') items.push({ x: o.x, y: o.y, draw: () => drawLamp(ctx, o.x, o.y, o.z, s.toggles[o.id] ?? false) })
    else if (state !== 'broken') items.push({ x: o.x, y: o.y, draw: () => drawObject(ctx, o.kind, o.x, o.y, o.z) })
  }
  for (const c of s.cats) {
    items.push({ x: c.x, y: c.y, draw: () => drawCatWithName(ctx, c, s.myId) })
  }
  items.sort((a, b) => (frontOf(a, b) ? 1 : -1))
  for (const it of items) it.draw()

  drawBird(ctx, s.time, s.nearBirdbath)

  for (const l of s.lasers) drawLaser(ctx, l.x, l.y, furnitureAt(l.x, l.y)?.h ?? 0, s.time)

  drawFx(ctx)

  if (s.interact) {
    const p = iso(s.interact.x, s.interact.y, 0)
    promptBubble(ctx, p.sx, p.sy - 60, s.interact.prompt)
  }
}

/**
 * a is nearer the camera than b. A point is in front of a box iff it is south
 * of the box's south edge or east of its east edge; two boxes compare the same
 * way; two points compare by diagonal depth.
 */
function frontOf(a: { r?: Rect; x: number; y: number }, b: { r?: Rect; x: number; y: number }): boolean {
  if (a.r && b.r) return a.r.x > b.r.x + b.r.w || a.r.y > b.r.y + b.r.h
  if (!a.r && b.r) return a.x > b.r.x + b.r.w || a.y > b.r.y + b.r.h
  if (a.r && !b.r) return !(b.x > a.r.x + a.r.w || b.y > a.r.y + a.r.h)
  return a.x + a.y > b.x + b.y
}

// -------------------------------------------------------------- base -----

function drawBase(ctx: CanvasRenderingContext2D) {
  // the whole panel is comic paper, and the house sits on a raised "page
  // board" diamond with a drop shadow — no void eating half the screen
  ctx.fillStyle = '#f7f1de'
  ctx.fillRect(-1400, -400, 3600, 2200)
  ctx.fillStyle = halftone(ctx, 'rgba(20,16,12,0.09)', 12, 1.6)
  ctx.fillRect(-1400, -400, 3600, 2200)

  const m = 160
  const pts = [iso(-m, -m), iso(1680 + m, -m), iso(1680 + m, 1160 + m), iso(-m, 1160 + m)]
  ctx.save()
  ctx.translate(18, 20)
  quad(ctx, pts); ctx.fillStyle = 'rgba(20,16,12,0.35)'; ctx.fill()
  ctx.restore()
  quad(ctx, pts)
  ctx.fillStyle = '#e8dfc8'; ctx.fill()
  outline(ctx, 6)
  // faint halftone on the board margin
  ctx.save()
  quad(ctx, pts); ctx.clip()
  ctx.fillStyle = halftone(ctx, 'rgba(20,16,12,0.08)', 12, 1.6)
  ctx.fillRect(-1400, -400, 3600, 2200)
  ctx.restore()
}

function drawFloors(ctx: CanvasRenderingContext2D) {
  for (const r of ROOMS) {
    const { rect } = r
    quad(ctx, [iso(rect.x, rect.y), iso(rect.x + rect.w, rect.y), iso(rect.x + rect.w, rect.y + rect.h), iso(rect.x, rect.y + rect.h)])
    if (r.floor === 'tile' || r.floor === 'bath') {
      ctx.fillStyle = r.floor === 'tile' ? '#f2e9d5' : '#dcecf2'; ctx.fill()
      ctx.save(); ctx.clip()
      ctx.strokeStyle = r.floor === 'tile' ? '#d8cbb0' : '#b8d4e0'; ctx.lineWidth = 2
      for (let x = rect.x; x <= rect.x + rect.w; x += 40) {
        const a = iso(x, rect.y), b = iso(x, rect.y + rect.h)
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke()
      }
      for (let y = rect.y; y <= rect.y + rect.h; y += 40) {
        const a = iso(rect.x, y), b = iso(rect.x + rect.w, y)
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke()
      }
      ctx.restore()
    } else if (r.floor === 'wood') {
      ctx.fillStyle = '#d9b98a'; ctx.fill()
      ctx.save(); ctx.clip()
      ctx.strokeStyle = '#c4a172'; ctx.lineWidth = 2
      for (let y = rect.y + 22; y < rect.y + rect.h; y += 44) {
        const a = iso(rect.x, y), b = iso(rect.x + rect.w, y)
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke()
      }
      ctx.strokeStyle = '#b89060'
      for (let y = rect.y + 44; y < rect.y + rect.h; y += 88) {
        for (let x = rect.x + ((y * 7) % 120); x < rect.x + rect.w; x += 160) {
          const a = iso(x, y - 44), b = iso(x, y)
          ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke()
        }
      }
      ctx.restore()
    } else if (r.floor === 'carpet') {
      ctx.fillStyle = '#e8b8c0'; ctx.fill()
      ctx.save(); ctx.clip()
      ctx.fillStyle = halftone(ctx, '#c98a96', 10, 1.6)
      ctx.fillRect(-1200, -100, 2900, 1700)
      ctx.restore()
    } else if (r.floor === 'grass') {
      ctx.fillStyle = '#a8d47a'; ctx.fill()
      ctx.save(); ctx.clip()
      ctx.strokeStyle = '#7fb356'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
      for (const t of tufts) {
        const p = iso(t.x, t.y)
        ctx.beginPath(); ctx.moveTo(p.sx, p.sy); ctx.lineTo(p.sx - 3, p.sy - 7 - t.s); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(p.sx + 4, p.sy); ctx.lineTo(p.sx + 6, p.sy - 6 - t.s); ctx.stroke()
      }
      for (const f of flowers) {
        const p = iso(f.x, f.y)
        ctx.fillStyle = f.c
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2
          ctx.beginPath(); ctx.arc(p.sx + Math.cos(a) * 4, p.sy + Math.sin(a) * 2.5, 2.8, 0, Math.PI * 2); ctx.fill()
        }
        ctx.beginPath(); ctx.arc(p.sx, p.sy, 2.5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill()
        outline(ctx, 1.5)
      }
      ctx.restore()
    }
    outline(ctx, 3)

    // room name lying flat on the floor plane
    ctx.save()
    const c = iso(rect.x + rect.w / 2, rect.y + rect.h / 2)
    ctx.translate(c.sx, c.sy)
    ctx.transform(ISO_COS, 0.5, -ISO_COS, 0.5, 0, 0)
    ctx.font = '400 44px Bangers, Impact, sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.globalAlpha = 0.10
    ctx.fillStyle = INK
    ctx.fillText(r.name.toUpperCase(), 0, 0)
    ctx.restore()
  }
}

const WALL_H_INNER = 55
const WALL_H_OUTER = 90
const WALL_H_STUB = 14
const wallH = (w: Rect) =>
  w.x <= 40 || w.y <= 40 || w.x + w.w >= 1640 || w.y + w.h >= 1120 ? WALL_H_OUTER : WALL_H_INNER

// Sims-style wall cutaway: a wall that would hide YOUR cat drops to a stub
// while the cat is close behind it, so you never lose sight of yourself.
function wallOccludesMe(w: Rect, mx: number, my: number): boolean {
  if (w.w >= w.h) {
    return my < w.y + w.h && my > w.y - 90 && mx > w.x - 40 && mx < w.x + w.w + 40
  }
  return mx < w.x + w.w && mx > w.x - 90 && my > w.y - 40 && my < w.y + w.h + 40
}

// windows sit on the visible south faces of north-side walls
const WINDOWS: { edgeY: number; x0: number; x1: number; z0: number; z1: number }[] = [
  { edgeY: 60, x0: 280, x1: 380, z0: 22, z1: 56 },    // kitchen
  { edgeY: 60, x0: 1420, x1: 1560, z0: 22, z1: 56 },  // bedroom
  { edgeY: 460, x0: 1480, x1: 1620, z0: 8, z1: 38 },  // living room (divider wall)
]

function drawWall(ctx: CanvasRenderingContext2D, w: Rect, s: RenderState) {
  const mePos = s.cats.find((c) => c.id === s.myId)
  const stub = mePos && wallOccludesMe(w, mePos.x, mePos.y)
  const h = stub ? WALL_H_STUB : wallH(w)
  box3(ctx, w, h, { top: '#8a745f', s: '#6b5a4a', e: '#57483a' })
  // a few brick courses on the visible faces
  ctx.strokeStyle = 'rgba(20,16,12,0.25)'; ctx.lineWidth = 1.5
  for (const z of [h * 0.33, h * 0.66]) {
    if (w.w >= w.h) {
      const a = iso(w.x, w.y + w.h, z), b = iso(w.x + w.w, w.y + w.h, z)
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke()
    } else {
      const a = iso(w.x + w.w, w.y, z), b = iso(w.x + w.w, w.y + w.h, z)
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke()
    }
  }
  // cap the open ends — door gaps and wall ends otherwise render hollow
  ctx.fillStyle = '#57483a'
  if (w.w >= w.h) {
    for (const ex of [w.x, w.x + w.w]) {
      quad(ctx, [iso(ex, w.y, 0), iso(ex, w.y + w.h, 0), iso(ex, w.y + w.h, h), iso(ex, w.y, h)])
      ctx.fill(); outline(ctx, 3)
    }
  } else {
    for (const ey of [w.y, w.y + w.h]) {
      quad(ctx, [iso(w.x, ey, 0), iso(w.x + w.w, ey, 0), iso(w.x + w.w, ey, h), iso(w.x, ey, h)])
      ctx.fill(); outline(ctx, 3)
    }
  }

  // windows on this wall's south face
  if (!stub && w.w >= w.h) {
    for (const win of WINDOWS) {
      if (w.y + w.h !== win.edgeY) continue
      const x0 = Math.max(win.x0, w.x), x1 = Math.min(win.x1, w.x + w.w)
      if (x0 >= x1) continue
      const z0 = Math.min(win.z0, h - 6), z1 = Math.min(win.z1, h - 6)
      quad(ctx, [
        iso(x0, win.edgeY, z1), iso(x1, win.edgeY, z1),
        iso(x1, win.edgeY, z0), iso(x0, win.edgeY, z0),
      ])
      ctx.fillStyle = '#bcdcf0'; ctx.fill()
      outline(ctx, 3)
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5
      const a = iso(x0 + (x1 - x0) * 0.3, win.edgeY, z1 - 5)
      const b = iso(x0 + (x1 - x0) * 0.15, win.edgeY, z0 + 5)
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke()
    }
  }
}

function drawThresholds(ctx: CanvasRenderingContext2D) {
  const gaps: Rect[] = [
    { x: 540, y: 200, w: 20, h: 90 }, { x: 540, y: 520, w: 20, h: 90 }, { x: 540, y: 880, w: 20, h: 90 },
    { x: 740, y: 200, w: 20, h: 90 }, { x: 740, y: 700, w: 20, h: 90 },
    { x: 280, y: 440, w: 100, h: 20 }, { x: 280, y: 700, w: 100, h: 20 }, { x: 1100, y: 440, w: 100, h: 20 },
  ]
  for (const r of gaps) topQuad(ctx, r, 1, '#c4a172', 2)
}

// ------------------------------------------------------------ furniture --

// ------------------------------------------------------------ furniture --

const WOOD = { top: '#d8b088', s: '#b08a5e', e: '#96744c' }
const WOOD_DARK = { top: '#a0714f', s: '#8a6242', e: '#75543a' }
const WHITE = { top: '#f2f7f8', s: '#d5dee0', e: '#b8c4c7' }

function drawFlat(ctx: CanvasRenderingContext2D, f: Furniture) {
  const r = f.rect
  topQuad(ctx, r, 2, f.kind === 'runner' ? '#b8524a' : '#d4a04e', 3.5)
  const inset = 10
  topQuad(ctx, { x: r.x + inset, y: r.y + inset, w: r.w - inset * 2, h: r.h - inset * 2 }, 3, f.kind === 'runner' ? '#a84640' : '#c18f42', 2)
}

function drawFurniture(ctx: CanvasRenderingContext2D, f: Furniture, s: RenderState) {
  const r = f.rect
  switch (f.kind) {
    case 'fridge': {
      box3(ctx, r, f.h, WHITE)
      sLine(ctx, r, 0.03, 45, 0.97, 45, 2.5) // freezer split
      sLine(ctx, r, 0.86, 20, 0.86, 38, 3)   // bottom handle
      sLine(ctx, r, 0.86, 52, 0.86, 72, 3)   // top handle
      for (const [u, z, c] of [[0.25, 66, '#e24141'], [0.55, 26, '#8fb8e8'], [0.4, 14, '#ffd23f']] as const) {
        sDot(ctx, r, u, z, 4, c)
      }
      break
    }
    case 'counter': {
      box3(ctx, r, f.h, WOOD)
      // the stove lives on top of it
      const st = FURNITURE.find((x) => x.id === 'stove')!
      box3(ctx, st.rect, st.h, { top: '#4a4a52', s: '#3a3a40', e: '#2e2e34' }, 50)
      for (const [u, v] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]] as const) {
        topEllipse(ctx, st.rect.x + st.rect.w * u, st.rect.y + st.rect.h * v, 58, 8, '#2b2b30', 2)
      }
      break
    }
    case 'table': {
      box3(ctx, r, f.h, WOOD)
      topQuad(ctx, { x: r.x + 8, y: r.y + 8, w: r.w - 16, h: r.h - 16 }, f.h, '#c99a68', 2)
      break
    }
    case 'bowl': {
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2
      topEllipse(ctx, cx, cy, 2, 16, '#e2578a')
      topEllipse(ctx, cx, cy, 8, 10, '#8a5a34', 2)
      ctx.fillStyle = '#5e3a1e'
      for (let i = 0; i < 4; i++) {
        const p = iso(cx - 8 + i * 5, cy + (i % 2) * 5, 10)
        ctx.beginPath(); ctx.arc(p.sx, p.sy, 2.2, 0, Math.PI * 2); ctx.fill()
      }
      break
    }
    case 'bed': {
      box3(ctx, r, f.h, { top: '#a8c8ea', s: '#8fb0d5', e: '#7a9cc0' })
      // headboard: tall thin box along the north edge
      box3(ctx, { x: r.x + r.w - 14, y: r.y - 4, w: 14, h: r.h + 8 }, 58, WOOD_DARK)
      // pillow
      topQuad(ctx, { x: r.x + r.w - 66, y: r.y + 18, w: 44, h: r.h - 36 }, f.h + 4, '#fdf8ee')
      // blanket shading
      ctx.save()
      quad(ctx, [iso(r.x + 4, r.y + 4, f.h), iso(r.x + r.w - 80, r.y + 4, f.h), iso(r.x + r.w - 80, r.y + r.h - 4, f.h), iso(r.x + 4, r.y + r.h - 4, f.h)])
      ctx.clip()
      ctx.fillStyle = halftone(ctx, '#5a87b8', 9, 1.4)
      ctx.fillRect(0, 0, 3000, 1600)
      ctx.restore()
      break
    }
    case 'dresser': case 'nightstand': {
      box3(ctx, r, f.h, WOOD_DARK)
      const rows = f.kind === 'dresser' ? 2 : 1
      for (let i = 1; i <= rows; i++) {
        const z = (f.h / (rows + 1)) * i
        sLine(ctx, r, 0.06, z, 0.94, z, 2)
        const knob = sPt(r, 0.5, z - f.h / (rows + 1) / 2)
        ctx.beginPath(); ctx.arc(knob.sx, knob.sy, 3, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill()
      }
      break
    }
    case 'sink': {
      box3(ctx, r, f.h, WHITE)
      topEllipse(ctx, r.x + r.w / 2, r.y + r.h * 0.62, f.h, 16, '#cfe4ea', 3)
      // little faucet sticking up
      const p = iso(r.x + r.w / 2, r.y + r.h * 0.25, f.h)
      ctx.beginPath(); ctx.moveTo(p.sx, p.sy); ctx.lineTo(p.sx, p.sy - 12); ctx.lineTo(p.sx + 8, p.sy - 12)
      ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke()
      break
    }
    case 'toilet': {
      // tank at the back (north side), bowl in front
      box3(ctx, { x: r.x + 8, y: r.y + 4, w: r.w - 16, h: 20 }, 52, WHITE)
      box3(ctx, { x: r.x + 4, y: r.y + 26, w: r.w - 8, h: r.h - 26 }, f.h, WHITE)
      topEllipse(ctx, r.x + r.w / 2, r.y + 26 + (r.h - 26) / 2, f.h, 12, '#9fc8dd', 2)
      break
    }
    case 'tub': {
      box3(ctx, r, f.h, WHITE)
      topQuad(ctx, { x: r.x + 10, y: r.y + 10, w: r.w - 20, h: r.h - 20 }, f.h, '#9fc8dd', 3)
      break
    }
    case 'litter': {
      box3(ctx, r, f.h, { top: '#9a9aa2', s: '#8a8a92', e: '#76767e' })
      topQuad(ctx, { x: r.x + 8, y: r.y + 8, w: r.w - 16, h: r.h - 16 }, f.h, '#d8cbb0', 2)
      ctx.save()
      quad(ctx, [iso(r.x + 8, r.y + 8, f.h), iso(r.x + r.w - 8, r.y + 8, f.h), iso(r.x + r.w - 8, r.y + r.h - 8, f.h), iso(r.x, r.y + r.h - 8, f.h)])
      ctx.clip()
      ctx.fillStyle = halftone(ctx, '#a89878', 7, 1.8)
      ctx.fillRect(0, 0, 3000, 1600)
      ctx.restore()
      break
    }
    case 'tree': {
      // trunk box + billboard canopy blobs above it
      box3(ctx, { x: r.x + 4, y: r.y + 10, w: r.w - 8, h: r.h - 20 }, 55, { top: '#7d5a3e', s: '#6b4a30', e: '#5a3d28' })
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
      box3(ctx, { x: r.x + r.w / 2 - 7, y: r.y + 10, w: 14, h: r.h - 14 }, 34, { top: '#c8c8d0', s: '#b0b0b8', e: '#9a9aa2' })
      topEllipse(ctx, r.x + r.w / 2, r.y + r.h / 2, 38, 20, '#b8b8c0', 3.5)
      topEllipse(ctx, r.x + r.w / 2, r.y + r.h / 2, 40, 12, '#9fc8dd', 2)
      break
    }
    case 'tvstand': {
      box3(ctx, r, f.h, WOOD_DARK)
      // the TV box stands on it, screen faces south
      const tv: Rect = { x: r.x + 20, y: r.y + 6, w: r.w - 40, h: 20 }
      box3(ctx, tv, 46, { top: '#3a3a40', s: '#2b2b30', e: '#222226' }, f.h)
      const on = s.toggles['tv1'] ?? false
      // screen = inset quad on the TV's south face
      const z0 = f.h + 8, z1 = f.h + 40
      quad(ctx, [sPt(tv, 0.07, z1), sPt(tv, 0.93, z1), sPt(tv, 0.93, z0), sPt(tv, 0.07, z0)])
      if (on) {
        ctx.fillStyle = '#9fc8dd'; ctx.fill()
        outline(ctx, 2.5)
        const n = Math.floor(s.time * 12) % 3
        ctx.save(); quad(ctx, [sPt(tv, 0.07, z1), sPt(tv, 0.93, z1), sPt(tv, 0.93, z0), sPt(tv, 0.07, z0)]); ctx.clip()
        for (let i = 0; i < 26; i++) {
          const u = ((i * 37 + n * 53) % 100) / 100
          const z = z0 + (((i * 23 + n * 31) % 100) / 100) * (z1 - z0)
          const p = sPt(tv, u, z)
          ctx.fillStyle = ['#ffffff55', '#ffffff22', '#00000033'][i % 3]
          ctx.fillRect(p.sx, p.sy, 6, 4)
        }
        ctx.restore()
      } else {
        ctx.fillStyle = '#14100c'; ctx.fill()
        outline(ctx, 2.5)
        const a = sPt(tv, 0.2, z1 - 4), b = sPt(tv, 0.35, z0 + 4)
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy)
        ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff44'; ctx.stroke()
      }
      break
    }
    case 'couch': {
      const red = { top: '#d97a84', s: '#c95f6a', e: '#a8454f' }
      // backrest along the north edge, arms on the sides
      box3(ctx, { x: r.x, y: r.y, w: r.w, h: 16 }, f.h + 34, red)
      box3(ctx, { x: r.x, y: r.y, w: 20, h: r.h }, f.h + 16, red)
      box3(ctx, { x: r.x + r.w - 20, y: r.y, w: 20, h: r.h }, f.h + 16, red)
      box3(ctx, { x: r.x + 16, y: r.y + 16, w: r.w - 32, h: r.h - 16 }, f.h, red)
      // cushion seam on the top
      const a = iso(r.x + r.w / 2, r.y + 16, f.h), b = iso(r.x + r.w / 2, r.y + r.h, f.h)
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy)
      ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke()
      // accumulated scratch damage on the south face + seat
      const n = s.damageCouch
      ctx.strokeStyle = '#7a3238'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'
      for (let i = 0; i < n; i++) {
        if (i % 2 === 0) {
          const u = 0.1 + ((i * 61) % 80) / 100
          const p = sPt(r, u, f.h * 0.55)
          for (let k = 0; k < 3; k++) {
            ctx.beginPath(); ctx.moveTo(p.sx + k * 6, p.sy); ctx.lineTo(p.sx + k * 6 - 8, p.sy + 10); ctx.stroke()
          }
        } else {
          const u = 0.15 + ((i * 41) % 70) / 100
          const p = tPt(r, u, 0.6 + ((i * 13) % 30) / 100, f.h)
          for (let k = 0; k < 3; k++) {
            ctx.beginPath(); ctx.moveTo(p.sx + k * 6, p.sy); ctx.lineTo(p.sx + k * 6 - 8, p.sy + 10); ctx.stroke()
          }
        }
      }
      break
    }
    case 'coffeetable': box3(ctx, r, f.h, WOOD_DARK); topQuad(ctx, { x: r.x + 6, y: r.y + 6, w: r.w - 12, h: r.h - 12 }, f.h, '#b08255', 2); break
    case 'bookshelf': {
      box3(ctx, r, f.h, WOOD_DARK)
      // book spines along the south face
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
      box3(ctx, { x: r.x, y: r.y + 20, w: r.w, h: r.h - 20 }, 10, WOOD)
      box3(ctx, post, 52, { top: '#b89a6e', s: '#a88a5e', e: '#8a704a' }, 10)
      // rope wraps on the south face
      for (let z = 18; z < 58; z += 7) sLine(ctx, post, 0, z, 1, z, 1.6)
      break
    }
    case 'plant': {
      box3(ctx, { x: r.x + 8, y: r.y + 26, w: r.w - 16, h: r.h - 30 }, f.h, { top: '#d98a5a', s: '#c97b4a', e: '#a86238' })
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

// ------------------------------------------------------------- objects ---

function drawObject(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, z: number) {
  const p = iso(x, y, z)
  ctx.save(); ctx.translate(p.sx, p.sy)
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
  }
  ctx.restore()
}

function drawLamp(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, on: boolean) {
  const p = iso(x, y, z)
  if (on) {
    const g = ctx.createRadialGradient(p.sx, p.sy - 16, 6, p.sx, p.sy - 16, 120)
    g.addColorStop(0, 'rgba(255,220,110,0.5)')
    g.addColorStop(1, 'rgba(255,220,110,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(p.sx, p.sy - 16, 120, 0, Math.PI * 2); ctx.fill()
  }
  ctx.save(); ctx.translate(p.sx, p.sy)
  ctx.fillStyle = '#4a4a52'; ctx.fillRect(-3, -16, 6, 20)
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.strokeRect(-3, -16, 6, 20)
  ctx.beginPath(); ctx.moveTo(-14, -30); ctx.lineTo(14, -30); ctx.lineTo(9, -14); ctx.lineTo(-9, -14); ctx.closePath()
  fillStroke(ctx, on ? '#ffd23f' : '#b8a888', 3)
  ctx.restore()
}

// -------------------------------------------------------------- cats -----

function drawCatWithName(ctx: CanvasRenderingContext2D, c: RenderCat, myId: string) {
  const p = iso(c.x, c.y, c.z)
  drawCat(ctx, p.sx, p.sy, c.cat, c.facing, c.pose, c.phase)
  // little name tag above
  ctx.save()
  ctx.font = '700 13px Bangers, Impact, sans-serif'
  const w = ctx.measureText(c.name).width + 14
  const y = p.sy - (c.pose === 'sleep' ? 30 : 44)
  ctx.beginPath()
  ctx.roundRect(p.sx - w / 2, y, w, 17, 5)
  ctx.fillStyle = c.id === myId ? '#ffd23f' : '#fff'
  ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = 1
  ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke()
  ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(c.name, p.sx, y + 9)
  ctx.restore()
}

// -------------------------------------------------------------- critters -

// deterministic garden clutter (world coords)
const tufts = Array.from({ length: 60 }, (_, i) => ({
  x: 80 + ((i * 137) % 440), y: 740 + ((i * 211) % 340), s: (i * 7) % 3,
}))
const flowers = Array.from({ length: 14 }, (_, i) => ({
  x: 90 + ((i * 173) % 420), y: 750 + ((i * 97) % 320),
  c: ['#e2578a', '#ffd23f', '#8fb8e8'][i % 3],
}))

function drawBird(ctx: CanvasRenderingContext2D, time: number, nearDist: number) {
  const cycle = time % 24
  if (cycle > 8) return
  const fleeing = nearDist < 110
  const fly = fleeing ? Math.min(1, (time * 4) % 1) * 160 : 0
  const bop = Math.sin(time * 6) * 2
  const p = iso(352, 806, 45)
  ctx.save()
  ctx.translate(p.sx + fly * 0.7, p.sy - 14 - bop - fly * 1.4)
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

function drawLaser(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, time: number) {
  const jitter = 2
  const p = iso(x + Math.sin(time * 31) * jitter, y + Math.cos(time * 37) * jitter, z)
  const g = ctx.createRadialGradient(p.sx, p.sy, 1, p.sx, p.sy, 22)
  g.addColorStop(0, 'rgba(255,40,40,0.55)')
  g.addColorStop(1, 'rgba(255,40,40,0)')
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.sx, p.sy, 22, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(p.sx, p.sy, 4.5, 0, Math.PI * 2)
  ctx.fillStyle = '#ff2828'; ctx.fill()
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke()
}
