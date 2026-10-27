// World renderer — behind-the-cat third person. The world stays flat top-down
// x/y (collision, layout, netcode unchanged); this file projects it through the
// perspective camera in cam.ts. Walls and furniture become shaded quads, cats
// and objects become scaled billboards, and everything sorts by real depth.

import { INK, fillStroke, halftone, promptBubble } from './comic'
import { ROOMS, WALLS, FURNITURE, OBJECTS, furnitureAt, type Furniture, type InteractTarget, type Rect } from './house'
import { cam, project, projPoly, type ScreenPt } from './cam'
import { drawCat } from './catdraw'
import { drawFx } from './effects'
import type { CatCustom, Facing, Pose } from './types'

export interface RenderCat {
  id: string
  name: string
  cat: CatCustom
  x: number
  y: number
  z: number
  facing: Facing
  pose: Pose
  phase: number
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
  myId: string | null
}

interface Drawable { depth: number; draw: () => void }

const FACE_ANG: Record<Facing, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }
const normAng = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a }

/** Convert a cat's world facing into the sprite facing seen from the camera. */
function relFacing(f: Facing): Facing {
  const r = normAng(FACE_ANG[f] - cam.yaw)
  if (Math.abs(r) < Math.PI / 4) return 'up'
  if (Math.abs(r) > Math.PI * 3 / 4) return 'down'
  return r > 0 ? 'right' : 'left'
}

/** Billboard scale — world units to screen px at this depth. */
const sc = (depth: number) => cam.focal / Math.max(20, depth)

// --------------------------------------------------------------- helpers --

function drawPoly(ctx: CanvasRenderingContext2D, pts: ScreenPt[] | null, fill: string, w = 3) {
  if (!pts || pts.length < 3) return
  ctx.beginPath()
  pts.forEach((p, i) => (i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy)))
  ctx.closePath()
  fillStroke(ctx, fill, w)
}

/** Push a screen-space poly onto the draw list, keyed by its farthest vertex. */
function pushPoly(out: Drawable[], ctx: CanvasRenderingContext2D, pts: [number, number, number][], fill: string, w = 3) {
  const pp = projPoly(pts)
  if (!pp) return
  const depth = Math.max(...pp.map((p) => p.depth))
  out.push({ depth, draw: () => drawPoly(ctx, pp, fill, w) })
}

/** A flat quad on the floor (rugs, thresholds) — always drawn in the ground pass. */
function flatQuad(ctx: CanvasRenderingContext2D, pts: [number, number, number][], fill: string, w = 0) {
  const pp = projPoly(pts)
  if (!pp) return
  ctx.beginPath()
  pp.forEach((p, i) => (i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy)))
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  if (w > 0) {
    ctx.strokeStyle = INK
    ctx.lineWidth = w
    ctx.stroke()
  }
}

/** Push a projected line segment onto the draw list. */
function pushSeg(out: Drawable[], ctx: CanvasRenderingContext2D, a: [number, number, number], b: [number, number, number], w: number, color = INK) {
  const pa = project(...a), pb = project(...b)
  if (!pa || !pb) return
  const depth = Math.max(pa.depth, pb.depth)
  out.push({
    depth,
    draw: () => {
      ctx.beginPath()
      ctx.moveTo(pa.sx, pa.sy)
      ctx.lineTo(pb.sx, pb.sy)
      ctx.strokeStyle = color
      ctx.lineWidth = w
      ctx.stroke()
    },
  })
}

/** Push a billboard circle (tree canopy, bush blobs, glows) onto the draw list. */
function pushBall(out: Drawable[], ctx: CanvasRenderingContext2D, x: number, y: number, z: number, r: number, fill: string, w = 3) {
  const p = project(x, y, z)
  if (!p) return
  const sr = r * sc(p.depth)
  out.push({
    depth: p.depth,
    draw: () => {
      ctx.beginPath()
      ctx.arc(p.sx, p.sy, sr, 0, Math.PI * 2)
      fillStroke(ctx, fill, w)
    },
  })
}

/** A quad aligned to one face of a rect, uv in [0,1] along the face, z heights. */
function faceRect(out: Drawable[], ctx: CanvasRenderingContext2D, r: Rect, face: 'n' | 's' | 'e' | 'w', u0: number, u1: number, z0: number, z1: number, fill: string) {
  const pts: [number, number, number][] =
    face === 's' ? [[r.x + r.w * u0, r.y + r.h, z0], [r.x + r.w * u1, r.y + r.h, z0], [r.x + r.w * u1, r.y + r.h, z1], [r.x + r.w * u0, r.y + r.h, z1]]
    : face === 'n' ? [[r.x + r.w * u1, r.y, z0], [r.x + r.w * u0, r.y, z0], [r.x + r.w * u0, r.y, z1], [r.x + r.w * u1, r.y, z1]]
    : face === 'e' ? [[r.x + r.w, r.y + r.h * u0, z0], [r.x + r.w, r.y + r.h * u1, z0], [r.x + r.w, r.y + r.h * u1, z1], [r.x + r.w, r.y + r.h * u0, z1]]
    : [[r.x, r.y + r.h * u1, z0], [r.x, r.y + r.h * u0, z0], [r.x, r.y + r.h * u0, z1], [r.x, r.y + r.h * u1, z1]]
  pushPoly(out, ctx, pts, fill, 2.5)
}

/** Which horizontal face of a rect faces the camera most. */
function camSide(r: Rect): 'n' | 's' | 'e' | 'w' {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2
  const dx = Math.abs(cam.x - cx), dy = Math.abs(cam.y - cy)
  if (dy >= dx) return cam.y > cy ? 's' : 'n'
  return cam.x > cx ? 'e' : 'w'
}

interface BoxCols { top: string; s: string; e: string; n?: string; w?: string }

/** Push a solid box — top face plus the camera-facing side faces. */
function box(out: Drawable[], ctx: CanvasRenderingContext2D, r: Rect, h: number, z0: number, cols: BoxCols) {
  const z1 = z0 + h
  pushPoly(out, ctx, [[r.x, r.y, z1], [r.x + r.w, r.y, z1], [r.x + r.w, r.y + r.h, z1], [r.x, r.y + r.h, z1]], cols.top, 3.5)
  if (cam.y > r.y + r.h) pushPoly(out, ctx, [[r.x, r.y + r.h, z0], [r.x + r.w, r.y + r.h, z0], [r.x + r.w, r.y + r.h, z1], [r.x, r.y + r.h, z1]], cols.s, 3.5)
  if (cam.y < r.y) pushPoly(out, ctx, [[r.x + r.w, r.y, z0], [r.x, r.y, z0], [r.x, r.y, z1], [r.x + r.w, r.y, z1]], cols.n ?? cols.e, 3.5)
  if (cam.x > r.x + r.w) pushPoly(out, ctx, [[r.x + r.w, r.y, z0], [r.x + r.w, r.y + r.h, z0], [r.x + r.w, r.y + r.h, z1], [r.x + r.w, r.y, z1]], cols.e, 3.5)
  if (cam.x < r.x) pushPoly(out, ctx, [[r.x, r.y + r.h, z0], [r.x, r.y, z0], [r.x, r.y, z1], [r.x, r.y + r.h, z1]], cols.w ?? cols.s, 3.5)
}

const WOOD: BoxCols = { top: '#b98d5e', s: '#966f46', e: '#7a5836' }
const WHITE: BoxCols = { top: '#fdfaf1', s: '#ddd6c4', e: '#c2bba6' }

// ----------------------------------------------------------------- walls --

const WALL_TOP = '#8a745f', WALL_S = '#6b5a4a', WALL_E = '#57483a'
const WALL_H_INNER = 55, WALL_H_OUTER = 90
const wallH = (w: Rect) =>
  w.x <= 40 || w.y <= 40 || w.x + w.w >= 1640 || w.y + w.h >= 1120 ? WALL_H_OUTER : WALL_H_INNER

const WINDOWS: { edgeY: number; x0: number; x1: number; z0: number; z1: number }[] = [
  { edgeY: 60, x0: 280, x1: 380, z0: 22, z1: 56 },
  { edgeY: 60, x0: 1420, x1: 1560, z0: 22, z1: 56 },
  { edgeY: 460, x0: 1480, x1: 1620, z0: 8, z1: 38 },
]

function drawWall(ctx: CanvasRenderingContext2D, out: Drawable[], w: Rect, h: number) {
  // top face
  pushPoly(out, ctx, [[w.x, w.y, h], [w.x + w.w, w.y, h], [w.x + w.w, w.y + w.h, h], [w.x, w.y + w.h, h]], WALL_TOP, 3.5)
  // side faces — only the ones the camera can see
  if (cam.y > w.y + w.h) pushPoly(out, ctx, [[w.x, w.y + w.h, 0], [w.x + w.w, w.y + w.h, 0], [w.x + w.w, w.y + w.h, h], [w.x, w.y + w.h, h]], WALL_S, 3.5)
  if (cam.y < w.y) pushPoly(out, ctx, [[w.x + w.w, w.y, 0], [w.x, w.y, 0], [w.x, w.y, h], [w.x + w.w, w.y, h]], WALL_S, 3.5)
  if (cam.x > w.x + w.w) pushPoly(out, ctx, [[w.x + w.w, w.y, 0], [w.x + w.w, w.y + w.h, 0], [w.x + w.w, w.y + w.h, h], [w.x + w.w, w.y, h]], WALL_E, 3.5)
  if (cam.x < w.x) pushPoly(out, ctx, [[w.x, w.y + w.h, 0], [w.x, w.y, 0], [w.x, w.y, h], [w.x, w.y + w.h, h]], WALL_E, 3.5)
  // end caps
  if (w.w >= w.h) {
    if (cam.x > w.x + w.w) pushPoly(out, ctx, [[w.x + w.w, w.y, 0], [w.x + w.w, w.y + w.h, 0], [w.x + w.w, w.y + w.h, h], [w.x + w.w, w.y, h]], WALL_E, 3)
    if (cam.x < w.x) pushPoly(out, ctx, [[w.x, w.y + w.h, 0], [w.x, w.y, 0], [w.x, w.y, h], [w.x, w.y + w.h, h]], WALL_E, 3)
  } else {
    if (cam.y > w.y + w.h) pushPoly(out, ctx, [[w.x, w.y + w.h, 0], [w.x + w.w, w.y + w.h, 0], [w.x + w.w, w.y + w.h, h], [w.x, w.y + w.h, h]], WALL_E, 3)
    if (cam.y < w.y) pushPoly(out, ctx, [[w.x + w.w, w.y, 0], [w.x, w.y, 0], [w.x, w.y, h], [w.x + w.w, w.y, h]], WALL_E, 3)
  }
  // windows on south faces that face the camera
  for (const win of WINDOWS) {
    if (w.y + w.h === win.edgeY && cam.y > win.edgeY && w.x <= win.x0 && w.x + w.w >= win.x1) {
      pushPoly(out, ctx, [[win.x0, win.edgeY, win.z0], [win.x1, win.edgeY, win.z0], [win.x1, win.edgeY, win.z1], [win.x0, win.edgeY, win.z1]], '#bcdcf0', 3)
    }
  }
}

// ------------------------------------------------------------ furniture --

const BOOK_COLORS = ['#e4574f', '#f2c14e', '#5aa9e6', '#7bc96f', '#e56bb0', '#f28c38', '#8a6bd8']

function drawFurniture(ctx: CanvasRenderingContext2D, out: Drawable[], f: Furniture, s: RenderState) {
  const r = f.rect
  const z = f.z ?? 0
  switch (f.kind) {
    case 'fridge': {
      box(out, ctx, r, 85, 0, WHITE)
      const side = camSide(r)
      if (side === 's' || side === 'n') faceRect(out, ctx, r, side, 0, 1, 52, 53, INK)
      faceRect(out, ctx, r, side, 0.3, 0.34, 56, 78, INK)
      faceRect(out, ctx, r, side, 0.62, 0.66, 56, 78, INK)
      faceRect(out, ctx, r, side, 0.68, 0.78, 64, 72, '#e4574f')
      faceRect(out, ctx, r, side, 0.52, 0.6, 58, 64, '#5aa9e6')
      break
    }
    case 'counter':
      box(out, ctx, r, 50, 0, WOOD)
      box(out, ctx, { x: 340, y: 84, w: 165, h: 42 }, 8, 50, { top: '#3a3a40', s: '#2a2a2e', e: '#1e1e22' })
      for (const bx of [380, 440]) for (const by of [95, 115])
        pushPoly(out, ctx, [[bx - 12, by - 7, 58.5], [bx + 12, by - 7, 58.5], [bx + 12, by + 7, 58.5], [bx - 12, by + 7, 58.5]], '#141414', 2)
      break
    case 'table':
      box(out, ctx, r, 42, 0, WOOD)
      pushPoly(out, ctx, [[r.x + 8, r.y + 8, 42.5], [r.x + r.w - 8, r.y + 8, 42.5], [r.x + r.w - 8, r.y + r.h - 8, 42.5], [r.x + 8, r.y + r.h - 8, 42.5]], '#a87d4f', 2)
      break
    case 'bowl':
      box(out, ctx, r, 8, 0, { top: '#f06a9b', s: '#d14f80', e: '#b0406a' })
      pushPoly(out, ctx, [[r.x + 8, r.y + 5, 8.5], [r.x + r.w - 8, r.y + 5, 8.5], [r.x + r.w - 8, r.y + r.h - 5, 8.5], [r.x + 8, r.y + r.h - 5, 8.5]], '#8a5a33', 2)
      break
    case 'bed':
      box(out, ctx, r, 34, 0, { top: '#f2b8c6', s: '#d994a6', e: '#c07a8d' })
      box(out, ctx, { x: r.x - 8, y: r.y - 8, w: r.w + 16, h: 16 }, 60, 0, WOOD)
      box(out, ctx, { x: r.x + 18, y: r.y + 14, w: 90, h: 52 }, 8, 34, { top: '#fdfaf1', s: '#ddd6c4', e: '#c2bba6' })
      break
    case 'dresser': case 'nightstand': {
      box(out, ctx, r, f.h, 0, WOOD)
      const side = camSide(r)
      const rows = f.kind === 'dresser' ? 3 : 2
      for (let i = 1; i < rows; i++) {
        const zz = (f.h * i) / rows
        faceRect(out, ctx, r, side, 0.06, 0.94, zz - 1, zz + 1, INK)
      }
      for (let i = 0; i < rows; i++) {
        const zz = (f.h * (i + 0.5)) / rows
        faceRect(out, ctx, r, side, 0.47, 0.53, zz - 2, zz + 2, '#f2c14e')
      }
      break
    }
    case 'sink':
      box(out, ctx, r, 48, 0, WHITE)
      pushPoly(out, ctx, [[r.x + 14, r.y + 12, 48.5], [r.x + r.w - 14, r.y + 12, 48.5], [r.x + r.w - 14, r.y + r.h - 12, 48.5], [r.x + 14, r.y + r.h - 12, 48.5]], '#a8d0e8', 2.5)
      pushSeg(out, ctx, [r.x + r.w / 2, r.y + 10, 48], [r.x + r.w / 2, r.y + 10, 68], 5)
      pushSeg(out, ctx, [r.x + r.w / 2, r.y + 10, 68], [r.x + r.w / 2, r.y + 26, 68], 5)
      break
    case 'toilet':
      box(out, ctx, { x: r.x + 8, y: r.y + 4, w: r.w - 16, h: 20 }, 52, 0, WHITE)
      box(out, ctx, { x: r.x + 4, y: r.y + 26, w: r.w - 8, h: r.h - 26 }, 36, 0, WHITE)
      pushPoly(out, ctx, [[r.x + 12, r.y + 32, 36.5], [r.x + r.w - 12, r.y + 32, 36.5], [r.x + r.w - 12, r.y + r.h - 8, 36.5], [r.x + 12, r.y + r.h - 8, 36.5]], '#a8d0e8', 2.5)
      break
    case 'tub':
      box(out, ctx, r, 46, 0, WHITE)
      pushPoly(out, ctx, [[r.x + 16, r.y + 12, 44], [r.x + r.w - 16, r.y + 12, 44], [r.x + r.w - 16, r.y + r.h - 12, 44], [r.x + 16, r.y + r.h - 12, 44]], '#9fd4ee', 2.5)
      break
    case 'litter':
      box(out, ctx, r, 26, 0, { top: '#f0dfc0', s: '#e8d5b0', e: '#d9c096' })
      pushPoly(out, ctx, [[r.x + 10, r.y + 8, 26.5], [r.x + r.w - 10, r.y + 8, 26.5], [r.x + r.w - 10, r.y + r.h - 8, 26.5], [r.x + 10, r.y + r.h - 8, 26.5]], '#d8c39a', 2)
      break
    case 'tree':
      box(out, ctx, r, 120, 0, { top: '#8a6540', s: '#7a5836', e: '#63452a' })
      for (const [ox, oy, or_] of [[-30, -30, 46], [30, -20, 42], [0, -52, 40], [-10, 5, 38]] as const)
        pushBall(out, ctx, r.x + 30 + ox, r.y + 22 + oy, 135, or_, '#79c25f', 4)
      break
    case 'bush':
      for (const [ox, oy, or_] of [[0, 0, 34], [26, 8, 26], [-24, 10, 26]] as const)
        pushBall(out, ctx, r.x + 30 + ox, r.y + 27 + oy, 40, or_, '#79c25f', 4)
      break
    case 'birdbath':
      box(out, ctx, { x: r.x + 12, y: r.y + 12, w: r.w - 24, h: r.h - 24 }, 40, 0, { top: '#d9d4c8', s: '#bdb8aa', e: '#a29d90' })
      box(out, ctx, r, 12, 40, { top: '#d9d4c8', s: '#bdb8aa', e: '#a29d90' })
      pushPoly(out, ctx, [[r.x + 6, r.y + 6, 52.5], [r.x + r.w - 6, r.y + 6, 52.5], [r.x + r.w - 6, r.y + r.h - 6, 52.5], [r.x + 6, r.y + r.h - 6, 52.5]], '#8fc6e8', 2)
      if (s.nearBirdbath < 140) drawBird(ctx, out, r.x + r.w / 2, r.y + r.h / 2, 54, s.time)
      break
    case 'tvstand': {
      box(out, ctx, r, 30, 0, WOOD)
      const tv = { x: r.x + 10, y: r.y + 4, w: r.w - 20, h: r.h - 8 }
      box(out, ctx, tv, 62, 30, { top: '#3a3a40', s: '#26262c', e: '#1c1c22' })
      const side = camSide(tv)
      if (side === 's' || side === 'e' || side === 'n' || side === 'w') {
        faceRect(out, ctx, tv, side, 0.08, 0.92, 36, 86, '#0e0e12')
        if (s.toggles.tv1) {
          const g = 0.5 + 0.5 * Math.sin(s.time * 9)
          faceRect(out, ctx, tv, side, 0.1, 0.9, 38, 84, `rgb(${40 + g * 40},${60 + g * 50},${90 + g * 60})`)
          for (let i = 0; i < 4; i++) {
            const u0 = 0.15 + ((i * 0.37 + s.time * 2.1) % 0.7)
            faceRect(out, ctx, tv, side, u0, u0 + 0.08, 44 + ((i * 17) % 30), 50 + ((i * 17) % 30), 'rgba(255,255,255,0.5)')
          }
        }
      }
      break
    }
    case 'couch': {
      box(out, ctx, { x: r.x, y: r.y + 34, w: r.w, h: r.h - 34 }, 36, 0, { top: '#e06c8a', s: '#c25573', e: '#a8455f' })
      box(out, ctx, { x: r.x, y: r.y, w: r.w, h: 38 }, 62, 0, { top: '#f07f9c', s: '#e06c8a', e: '#c25573' })
      box(out, ctx, { x: r.x, y: r.y, w: 24, h: r.h }, 48, 0, { top: '#f07f9c', s: '#e06c8a', e: '#c25573' })
      box(out, ctx, { x: r.x + r.w - 24, y: r.y, w: 24, h: r.h }, 48, 0, { top: '#f07f9c', s: '#e06c8a', e: '#c25573' })
      pushSeg(out, ctx, [r.x + r.w / 2, r.y + 36, 36.5], [r.x + r.w / 2, r.y + r.h - 4, 36.5], 2)
      const dmg = s.damageCouch
      if (dmg > 0) {
        const marks = Math.min(34, Math.floor(dmg * 1.7))
        for (let i = 0; i < marks; i++) {
          const rx = r.x + 20 + ((i * 37) % (r.w - 40))
          const ry = r.y + 44 + ((i * 23) % (r.h - 52))
          pushSeg(out, ctx, [rx, ry, 36.6], [rx + 8, ry + 4, 36.6], 1.5, '#8a2f47')
        }
      }
      break
    }
    case 'coffeetable':
      box(out, ctx, r, 30, 0, WOOD)
      pushPoly(out, ctx, [[r.x + 8, r.y + 6, 30.5], [r.x + r.w - 8, r.y + 6, 30.5], [r.x + r.w - 8, r.y + r.h - 6, 30.5], [r.x + 8, r.y + r.h - 6, 30.5]], '#a87d4f', 2)
      break
    case 'bookshelf': {
      box(out, ctx, r, f.h, 0, WOOD)
      const side = camSide(r)
      for (let i = 0; i < 12; i++) {
        const u0 = 0.05 + (i * 0.9) / 12
        faceRect(out, ctx, r, side, u0, u0 + 0.055, 4, 4 + 26 + (i % 3) * 6, BOOK_COLORS[i % BOOK_COLORS.length])
      }
      break
    }
    case 'post':
      box(out, ctx, r, 14, 0, WOOD)
      box(out, ctx, { x: r.x + 16, y: r.y + 14, w: r.w - 32, h: r.h - 28 }, 85, 14, { top: '#c9a35f', s: '#b08d4c', e: '#94763d' })
      pushSeg(out, ctx, [r.x + 16, r.y + r.h - 14, 30], [r.x + r.w - 16, r.y + r.h - 14, 38], 2, '#6b4f2a')
      pushSeg(out, ctx, [r.x + 16, r.y + r.h - 14, 55], [r.x + r.w - 16, r.y + r.h - 14, 63], 2, '#6b4f2a')
      break
    case 'plant':
      box(out, ctx, { x: r.x + 8, y: r.y + 8, w: r.w - 16, h: r.h - 16 }, 30, 0, { top: '#c46b4a', s: '#a8563a', e: '#8c452e' })
      pushBall(out, ctx, r.x + r.w / 2 - 14, r.y + r.h / 2 - 10, 62, 22, '#4e9e4a', 3.5)
      pushBall(out, ctx, r.x + r.w / 2 + 12, r.y + r.h / 2 - 14, 70, 24, '#5db35a', 3.5)
      pushBall(out, ctx, r.x + r.w / 2 + 2, r.y + r.h / 2 + 8, 56, 20, '#4e9e4a', 3.5)
      break
    default:
      box(out, ctx, r, f.h, z, WOOD)
  }
}

// --------------------------------------------------------------- objects --

function drawObject(ctx: CanvasRenderingContext2D, out: Drawable[], o: (typeof OBJECTS)[number], s: RenderState) {
  const st = s.objects[o.id]
  if (o.kind === 'tvscreen') return
  if (st === 'broken') {
    // knocked objects lie on the floor as flat little bits
    flatInto(out, ctx, o.x + 6, o.y + 8, 8, '#b9c0c9')
    return
  }
  const p = project(o.x, o.y, o.z + 6)
  if (!p) return
  const scale = sc(p.depth) * 0.9
  out.push({
    depth: p.depth,
    draw: () => {
      ctx.save()
      ctx.translate(p.sx, p.sy)
      ctx.scale(scale, scale)
      switch (o.kind) {
        case 'vase':
          ctx.beginPath(); ctx.moveTo(-7, 10); ctx.bezierCurveTo(-12, 4, -8, -6, -4, -9); ctx.lineTo(-4, -12); ctx.lineTo(4, -12); ctx.lineTo(4, -9); ctx.bezierCurveTo(8, -6, 12, 4, 7, 10); ctx.closePath()
          fillStroke(ctx, '#5aa9e6', 2.5)
          ctx.fillStyle = '#fff'; ctx.fillRect(-6, -4, 3, 8)
          break
        case 'cup': case 'mug':
          ctx.beginPath(); ctx.roundRect(-7, -8, 14, 16, 3)
          fillStroke(ctx, o.kind === 'cup' ? '#f2c14e' : '#e4574f', 2.5)
          break
        case 'frame':
          ctx.beginPath(); ctx.roundRect(-11, -9, 22, 18, 2)
          fillStroke(ctx, '#8a6540', 2.5)
          ctx.beginPath(); ctx.roundRect(-7, -5, 14, 10, 1)
          fillStroke(ctx, '#f2b8c6', 1.5)
          break
        case 'books':
          for (let i = 0; i < 3; i++) {
            ctx.beginPath(); ctx.roundRect(-11 + i * 3, 8 - i * 6 - 6, 22, 6, 1)
            fillStroke(ctx, BOOK_COLORS[i], 1.5)
          }
          break
        case 'tp':
          ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2)
          fillStroke(ctx, '#fff', 2.5)
          ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2)
          fillStroke(ctx, '#c9a35f', 1.5)
          ctx.beginPath(); ctx.moveTo(6, 3); ctx.lineTo(13, 6); ctx.lineTo(13, 10); ctx.lineTo(6, 8)
          fillStroke(ctx, '#fff', 1.5)
          break
        case 'lamp': {
          ctx.beginPath(); ctx.moveTo(-12, 10); ctx.lineTo(-5, -10); ctx.lineTo(5, -10); ctx.lineTo(12, 10); ctx.closePath()
          fillStroke(ctx, '#f2c14e', 2.5)
          if (s.toggles.lamp1) {
            ctx.save()
            ctx.globalAlpha = 0.35
            ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2)
            ctx.fillStyle = '#ffe9a8'; ctx.fill()
            ctx.restore()
          }
          break
        }
      }
      ctx.restore()
    },
  })
}

function flatInto(out: Drawable[], ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  const p = project(x, y, 2)
  if (!p) return
  const sr = r * sc(p.depth)
  out.push({
    depth: p.depth,
    draw: () => {
      ctx.beginPath()
      ctx.ellipse(p.sx, p.sy, sr, sr * 0.5, 0, 0, Math.PI * 2)
      fillStroke(ctx, fill, 2)
    },
  })
}

function drawBird(ctx: CanvasRenderingContext2D, out: Drawable[], x: number, y: number, z: number, t: number) {
  const p = project(x, y, z)
  if (!p) return
  const scale = sc(p.depth)
  const bob = Math.sin(t * 6) * 1.5
  out.push({
    depth: p.depth,
    draw: () => {
      ctx.save()
      ctx.translate(p.sx, p.sy + bob * scale)
      ctx.scale(scale, scale)
      ctx.beginPath(); ctx.ellipse(0, -6, 8, 6, 0, 0, Math.PI * 2)
      fillStroke(ctx, '#5aa9e6', 2)
      ctx.beginPath(); ctx.arc(6, -12, 4.5, 0, Math.PI * 2)
      fillStroke(ctx, '#5aa9e6', 2)
      ctx.beginPath(); ctx.moveTo(9, -12); ctx.lineTo(14, -11); ctx.lineTo(9, -10)
      fillStroke(ctx, '#f28c38', 1.5)
      ctx.restore()
    },
  })
}

// ----------------------------------------------------------------- floors --

const FLOOR_FILL: Record<string, string> = {
  tile: '#f2e9d5', bath: '#dcecf2', wood: '#d9b98a', carpet: '#e8b8c0', grass: '#a8d47a',
}
const FLOOR_LINE: Record<string, string> = { tile: '#d8cbb0', bath: '#b8d4e0', wood: '#c4a172' }

function drawFloors(ctx: CanvasRenderingContext2D, s: RenderState) {
  // world-base ground
  flatQuad(ctx, [[-80, -80, 0], [1760, -80, 0], [1760, 1240, 0], [-80, 1240, 0]], '#e8dfc8')
  for (const room of ROOMS) {
    flatQuad(ctx, [[room.rect.x, room.rect.y, 0], [room.rect.x + room.rect.w, room.rect.y, 0], [room.rect.x + room.rect.w, room.rect.y + room.rect.h, 0], [room.rect.x, room.rect.y + room.rect.h, 0]], FLOOR_FILL[room.floor])
    // floor texture: grid lines for hard floors, plank lines for wood
    if (room.floor === 'tile' || room.floor === 'bath') {
      for (let gx = room.rect.x + 80; gx < room.rect.x + room.rect.w; gx += 80)
        segFlat(ctx, [gx, room.rect.y, 0.5], [gx, room.rect.y + room.rect.h, 0.5], FLOOR_LINE[room.floor])
      for (let gy = room.rect.y + 80; gy < room.rect.y + room.rect.h; gy += 80)
        segFlat(ctx, [room.rect.x, gy, 0.5], [room.rect.x + room.rect.w, gy, 0.5], FLOOR_LINE[room.floor])
    }
    if (room.floor === 'wood') {
      for (let gy = room.rect.y + 44; gy < room.rect.y + room.rect.h; gy += 44)
        segFlat(ctx, [room.rect.x, gy, 0.5], [room.rect.x + room.rect.w, gy, 0.5], FLOOR_LINE.wood)
    }
    if (room.name === 'garden') {
      for (let gx = room.rect.x + 80; gx < room.rect.x + room.rect.w; gx += 80)
        segFlat(ctx, [gx, room.rect.y, 0.5], [gx, room.rect.y + room.rect.h, 0.5], 'rgba(20,16,12,0.12)')
      for (let gy = room.rect.y + 80; gy < room.rect.y + room.rect.h; gy += 80)
        segFlat(ctx, [room.rect.x, gy, 0.5], [room.rect.x + room.rect.w, gy, 0.5], 'rgba(20,16,12,0.12)')
    }
    if (room.name === 'garden') {
      for (let i = 0; i < 26; i++) {
        const gx = room.rect.x + 30 + ((i * 137) % (room.rect.w - 60))
        const gy = room.rect.y + 30 + ((i * 89) % (room.rect.h - 60))
        const p = project(gx, gy, 1)
        if (!p) continue
        const s2 = sc(p.depth)
        ctx.strokeStyle = '#4e9e4a'
        ctx.lineWidth = Math.max(1, 2 * s2)
        ctx.beginPath()
        ctx.moveTo(p.sx, p.sy)
        ctx.lineTo(p.sx - 4 * s2, p.sy - 8 * s2)
        ctx.moveTo(p.sx, p.sy)
        ctx.lineTo(p.sx + 4 * s2, p.sy - 8 * s2)
        ctx.stroke()
        if (i % 5 === 0) {
          ctx.beginPath()
          ctx.arc(p.sx + 8 * s2, p.sy - 4 * s2, 3.5 * s2, 0, Math.PI * 2)
          fillStroke(ctx, i % 10 === 0 ? '#f06a9b' : '#f2c14e', 1.5)
        }
      }
    }
  }
  // door thresholds
  for (const d of [[540, 200, 20, 90], [540, 880, 20, 90], [740, 200, 20, 90], [740, 700, 20, 90], [280, 440, 100, 20], [700, 440, 40, 20], [950, 440, 40, 20]] as const)
    flatQuad(ctx, [[d[0], d[1], 0.5], [d[0] + d[2], d[1], 0.5], [d[0] + d[2], d[1] + d[3], 0.5], [d[0], d[1] + d[3], 0.5]], '#c9a35f')
  // flat rugs + runner
  for (const f of FURNITURE) {
    if (!f.flat) continue
    const col = f.kind === 'runner' ? '#c94f4f' : f.kind === 'rug' ? '#e8b04a' : '#e8b04a'
    flatQuad(ctx, [[f.rect.x, f.rect.y, 1], [f.rect.x + f.rect.w, f.rect.y, 1], [f.rect.x + f.rect.w, f.rect.y + f.rect.h, 1], [f.rect.x, f.rect.y + f.rect.h, 1]], col, 3)
    if (f.kind === 'runner') {
      const p0 = project(f.rect.x + 10, f.rect.y + 10, 1.5), p1 = project(f.rect.x + f.rect.w - 10, f.rect.y + f.rect.h - 10, 1.5)
      if (p0 && p1) {
        // border stripe, cheap: second inset quad
        flatQuad(ctx, [[f.rect.x + 12, f.rect.y + 12, 1.5], [f.rect.x + f.rect.w - 12, f.rect.y + 12, 1.5], [f.rect.x + f.rect.w - 12, f.rect.y + f.rect.h - 12, 1.5], [f.rect.x + 12, f.rect.y + f.rect.h - 12, 1.5]], '#a83e3e', 2)
      }
    }
  }
}

function segFlat(ctx: CanvasRenderingContext2D, a: [number, number, number], b: [number, number, number], color: string) {
  const pa = project(...a), pb = project(...b)
  if (!pa || !pb) return
  ctx.beginPath()
  ctx.moveTo(pa.sx, pa.sy)
  ctx.lineTo(pb.sx, pb.sy)
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.stroke()
}

// ----------------------------------------------------------------- render --

export function render(ctx: CanvasRenderingContext2D, s: RenderState) {
  // sky — comic paper with a halftone band sinking toward the horizon
  const vh = cam.hor / 0.36 // canvas height recovered from horizon fraction
  const vw = cam.cx0 * 2
  ctx.fillStyle = '#f7f1de'
  ctx.fillRect(0, 0, vw, vh)
  const grd = ctx.createLinearGradient(0, cam.hor - vh * 0.3, 0, cam.hor)
  grd.addColorStop(0, 'rgba(255,214,140,0)')
  grd.addColorStop(1, 'rgba(255,196,110,0.55)')
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, vw, cam.hor)
  ctx.save()
  ctx.beginPath(); ctx.rect(0, 0, vw, cam.hor); ctx.clip()
  ctx.fillStyle = halftone(ctx, 'rgba(20,16,12,0.08)', 12, 1.6)
  ctx.fillRect(0, 0, vw, cam.hor)
  ctx.restore()

  drawFloors(ctx, s)

  // ---- depth-sorted items
  const out: Drawable[] = []

  for (const w of WALLS) drawWall(ctx, out, w, wallH(w))
  for (const f of FURNITURE) {
    if (f.flat || f.kind === 'stove') continue
    drawFurniture(ctx, out, f, s)
  }
  for (const o of OBJECTS) drawObject(ctx, out, o, s)

  // laser dots
  for (const l of s.lasers) {
    const h = furnitureAt(l.x, l.y)?.h ?? 0
    pushBall(out, ctx, l.x, l.y, h + 2, 7, '#e24141', 2)
  }

  // cats as billboards, facing relative to the camera
  for (const c of s.cats) {
    const p = project(c.x, c.y, c.z)
    if (!p) continue
    const scale = sc(p.depth)
    const facing = relFacing(c.facing)
    const isMe = c.id === s.myId
    out.push({
      depth: p.depth - 1, // cats pop slightly in front of furniture at the same depth
      draw: () => {
        ctx.save()
        ctx.translate(p.sx, p.sy)
        ctx.scale(scale, scale)
        drawCat(ctx, 0, 0, c.cat, facing, c.pose, c.phase)
        ctx.restore()
        // name tag
        if (c.name) {
          ctx.save()
          ctx.translate(p.sx, p.sy - 52 * scale)
          const tagScale = Math.max(0.6, Math.min(1.6, scale))
          ctx.scale(tagScale, tagScale)
          ctx.font = 'bold 11px Comic Sans MS, Chalkboard SE, sans-serif'
          const tw = ctx.measureText(c.name.toUpperCase()).width + 14
          ctx.beginPath(); ctx.roundRect(-tw / 2, -16, tw, 18, 5)
          ctx.fillStyle = isMe ? '#f2c14e' : '#fdfaf1'
          ctx.fill()
          ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke()
          ctx.fillStyle = INK
          ctx.textAlign = 'center'
          ctx.fillText(c.name.toUpperCase(), 0, -3)
          ctx.restore()
        }
      },
    })
  }

  // sort far -> near and draw
  out.sort((a, b) => b.depth - a.depth)
  for (const d of out) d.draw()

  // effects — projected billboards
  drawFx(ctx)

  // interaction prompt
  if (s.interact) {
    const iz = s.interact.furniture?.h ?? s.interact.object?.z ?? 0
    const p = project(s.interact.x, s.interact.y, iz + 20)
    if (p) promptBubble(ctx, p.sx, p.sy - 30 * sc(p.depth), `E — ${s.interact.prompt}`)
  }
}
