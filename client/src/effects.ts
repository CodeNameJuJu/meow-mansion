// Fire-and-forget comic effects: starbursts, speech bubbles, hearts,
// dust puffs, paper scraps, broken-shard debris, stink lines, motion lines.
// Positions are world coords — projected to screen at draw time.

import { INK, burst, speechBubble } from './comic'
import { project, cam } from './cam'

export interface Fx {
  kind: 'burst' | 'bubble' | 'hearts' | 'zzz' | 'puff' | 'shards' | 'stink' | 'paper' | 'splash' | 'lines' | 'angry'
  x: number; y: number        // world coords
  ox?: number; oy?: number    // extra screen-space offset
  t: number                   // elapsed
  ttl: number
  text?: string
  follow?: string             // player id to track (bubbles)
  color?: string              // scrap colour for 'paper'
  seed: number
}

export const fx: Fx[] = []

let seedCounter = 1
export function spawn(kind: Fx['kind'], x: number, y: number, opts: Partial<Fx> = {}) {
  fx.push({ kind, x, y, t: 0, ttl: 1, seed: (seedCounter * 2654435761) >>> 0, ...opts, ...(seedCounter++, {}) } as Fx)
}

const rnd = (seed: number, i: number) => {
  const v = Math.sin(seed * 0.0001 + i * 127.1) * 43758.5453
  return v - Math.floor(v)
}

export function updateFx(dt: number, resolvePos: (id: string) => { x: number; y: number } | null) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]
    f.t += dt
    if (f.follow) {
      const p = resolvePos(f.follow)
      if (p) { f.x = p.x; f.y = p.y }
    }
    if (f.t > f.ttl) fx.splice(i, 1)
  }
}

export function drawFx(ctx: CanvasRenderingContext2D) {
  for (const f of fx) {
    const p = project(f.x, f.y)
    if (!p) continue
    const dScale = Math.max(0.3, Math.min(3, cam.focal / p.depth))
    const fx_ = p.sx + (f.ox ?? 0) * dScale
    const fy_ = p.sy + (f.oy ?? 0) * dScale
    const t = f.t / f.ttl
    switch (f.kind) {
      case 'burst': burst(ctx, fx_, fy_, (f.ttl > 1.2 ? 88 : 70) * Math.min(2, dScale), f.text ?? 'POW!', t, f.text === 'HISS!' ? '#e24141' : '#ffd23f'); break
      case 'bubble': speechBubble(ctx, fx_, fy_, f.text ?? '', Math.min(1, (1 - t) * 6, t * 8)); break
      case 'hearts': {
        for (let i = 0; i < 4; i++) {
          const hx = fx_ - 20 + i * 13 + rnd(f.seed, i) * 8
          const hy = fy_ - t * 46 - rnd(f.seed, i + 9) * 10
          drawHeart(ctx, hx, hy, 6, Math.max(0, 1 - t))
        }
        break
      }
      case 'angry': { // classic red anger cross
        const s = 12 * Math.min(1, t * 4)
        ctx.save(); ctx.translate(fx_, fy_ - 24); ctx.rotate(0.2)
        ctx.strokeStyle = '#e24141'; ctx.lineWidth = 5; ctx.lineCap = 'round'
        for (const a of [Math.PI / 4, -Math.PI / 4]) {
          ctx.beginPath()
          ctx.moveTo(Math.cos(a) * -s, Math.sin(a) * -s); ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s)
          ctx.moveTo(Math.cos(a) * -s, Math.sin(a) * s); ctx.lineTo(Math.cos(a) * s, Math.sin(a) * -s)
          ctx.stroke()
        }
        ctx.restore(); break
      }
      case 'zzz': {
        ctx.font = '700 18px Bangers, Impact, sans-serif'
        for (let i = 0; i < 3; i++) {
          const zi = (t * 3 + i * 0.33) % 1
          const zx = fx_ + 14 + i * 9 + Math.sin(zi * 6) * 4
          const zy = fy_ - 22 - zi * 40
          ctx.globalAlpha = 1 - zi
          ctx.lineWidth = 3; ctx.strokeStyle = INK
          ctx.strokeText('z', zx, zy)
          ctx.fillStyle = '#fff'
          ctx.fillText('z', zx, zy)
        }
        ctx.globalAlpha = 1
        break
      }
      case 'puff': {
        for (let i = 0; i < 5; i++) {
          const a = rnd(f.seed, i) * Math.PI * 2
          const d = t * (14 + rnd(f.seed, i + 5) * 20)
          ctx.beginPath()
          ctx.arc(fx_ + Math.cos(a) * d, fy_ + Math.sin(a) * d * 0.6 - t * 12, 5 * (1 - t) + 2, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(190,180,160,${0.75 * (1 - t)})`
          ctx.fill()
        }
        break
      }
      case 'stink': {
        ctx.lineWidth = 2.5
        for (let i = 0; i < 3; i++) {
          const sx = fx_ - 14 + i * 14
          ctx.beginPath()
          ctx.strokeStyle = `rgba(90,140,60,${0.7 * (1 - t)})`
          for (let s = 0; s <= 8; s++) {
            const sy = fy_ - t * 30 - s * 4
            const px = sx + Math.sin(s * 0.9 + t * 8 + i * 2) * 3
            s === 0 ? ctx.moveTo(px, sy) : ctx.lineTo(px, sy)
          }
          ctx.stroke()
        }
        break
      }
      case 'paper': { // toilet paper scraps / leaves / confetti bits
        const col = f.color ?? '#fff'
        for (let i = 0; i < 7; i++) {
          const vx = (rnd(f.seed, i) - 0.5) * 60
          const vy = -rnd(f.seed, i + 3) * 60
          const px = fx_ + vx * t, py = fy_ + vy * t + 50 * t * t
          ctx.save()
          ctx.translate(px, py); ctx.rotate(rnd(f.seed, i + 7) * 6 + t * 8)
          ctx.beginPath(); ctx.rect(-5, -3, 10, 6)
          ctx.fillStyle = col; ctx.globalAlpha = 1 - t; ctx.fill()
          ctx.globalAlpha = (1 - t) * 0.9; ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke()
          ctx.restore()
        }
        ctx.globalAlpha = 1
        break
      }
      case 'shards': { // broken pottery bits that linger
        for (let i = 0; i < 6; i++) {
          const px = fx_ + (rnd(f.seed, i) - 0.5) * 36
          const py = fy_ + 6 + rnd(f.seed, i + 3) * 10
          ctx.save()
          ctx.translate(px, py); ctx.rotate(rnd(f.seed, i + 5) * 6)
          ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(5, 3); ctx.lineTo(-4, 2); ctx.closePath()
          ctx.globalAlpha = Math.min(1, 2 - t * 2.2)
          ctx.fillStyle = '#8fb8e8'; ctx.fill()
          ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke()
          ctx.restore()
        }
        ctx.globalAlpha = 1
        break
      }
      case 'splash': {
        ctx.strokeStyle = '#5aa7e0'; ctx.lineWidth = 3; ctx.lineCap = 'round'
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + (rnd(f.seed, i) - 0.5) * 2.2
          const d = t * (18 + rnd(f.seed, i + 4) * 22)
          ctx.globalAlpha = 1 - t
          ctx.beginPath()
          ctx.moveTo(fx_ + Math.cos(a) * d * 0.4, fy_ + Math.sin(a) * d * 0.4)
          ctx.lineTo(fx_ + Math.cos(a) * d, fy_ + Math.sin(a) * d + t * 14)
          ctx.stroke()
        }
        ctx.globalAlpha = 1
        break
      }
      case 'lines': { // radial speed lines around a zooming cat
        ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
        ctx.globalAlpha = 0.6 * (1 - t)
        for (let i = 0; i < 5; i++) {
          const a = rnd(f.seed, i) * Math.PI * 2
          const d0 = 26 + rnd(f.seed, i + 8) * 10
          ctx.beginPath()
          ctx.moveTo(fx_ + Math.cos(a) * d0, fy_ + Math.sin(a) * d0 * 0.7)
          ctx.lineTo(fx_ + Math.cos(a) * (d0 + 16), fy_ + Math.sin(a) * (d0 + 16) * 0.7)
          ctx.stroke()
        }
        ctx.globalAlpha = 1
        break
      }
    }
  }
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, alpha: number) {
  ctx.save()
  ctx.translate(x, y); ctx.scale(s / 10, s / 10); ctx.globalAlpha = alpha
  ctx.beginPath()
  ctx.moveTo(0, 4)
  ctx.bezierCurveTo(-11, -5, -4, -13, 0, -6)
  ctx.bezierCurveTo(4, -13, 11, -5, 0, 4)
  ctx.fillStyle = '#e2578a'; ctx.fill()
  ctx.lineWidth = 1.6; ctx.strokeStyle = INK; ctx.stroke()
  ctx.restore()
}
