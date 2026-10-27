// Procedural comic cats. Everything is thick outlines, flat colour and big
// cartoon eyes — there are no image assets. A cat is drawn from its custom
// { color, pattern, accessory } plus facing/pose/anim-phase.

import { INK, fillStroke, ellipse } from './comic'
import type { CatCustom, Facing, Pose } from './types'

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * 2.55)))
  return `#${((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0')}`
}

const wag = (phase: number, amp: number) => Math.sin(phase * 2.2) * amp

function tail(ctx: CanvasRenderingContext2D, color: string, x0: number, y0: number, phase: number, big = false) {
  const tipX = x0 + wag(phase, big ? 14 : 9)
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.quadraticCurveTo(x0 + (tipX - x0) * 0.4, y0 - 26, tipX, y0 - 34 - wag(phase, 4))
  ctx.lineWidth = 13; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke()
  ctx.lineWidth = 8; ctx.strokeStyle = color; ctx.stroke()
  // tail tip stripe for tabbies is added by caller if needed
  ctx.beginPath()
  ctx.arc(tipX, y0 - 34 - wag(phase, 4), 7, 0, Math.PI * 2)
  ctx.fillStyle = color; ctx.fill()
}

// seen from behind, the tail trails away on the floor — it hangs down past
// the feet rather than curling up over the head
function tailBack(ctx: CanvasRenderingContext2D, color: string, phase: number) {
  const tipX = wag(phase, 12)
  const tipY = 38 + wag(phase, 3)
  ctx.beginPath()
  ctx.moveTo(0, 10)
  ctx.quadraticCurveTo(tipX * 0.4, 30, tipX, tipY)
  ctx.lineWidth = 13; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke()
  ctx.lineWidth = 8; ctx.strokeStyle = color; ctx.stroke()
  ctx.beginPath()
  ctx.arc(tipX, tipY, 7, 0, Math.PI * 2)
  ctx.fillStyle = color; ctx.fill()
}

function bodyPattern(ctx: CanvasRenderingContext2D, cat: CatCustom, cx: number, cy: number, rx: number, ry: number) {
  const dark = shade(cat.color, -55)
  ctx.save()
  ellipse(ctx, cx, cy, rx - 2, ry - 2)
  ctx.clip()
  if (cat.pattern === 'tabby') {
    ctx.strokeStyle = dark; ctx.lineWidth = 4; ctx.lineCap = 'round'
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath()
      ctx.arc(cx + i * 9, cy - ry + 4, 7, 0.3, Math.PI - 0.3)
      ctx.stroke()
    }
    ctx.beginPath(); ctx.arc(cx, cy + ry - 6, 8, Math.PI + 0.4, -0.4); ctx.stroke()
  } else if (cat.pattern === 'spots') {
    ctx.fillStyle = dark
    for (const [dx, dy, r] of [[-7, -4, 4], [6, 2, 5], [0, 9, 3.5], [-2, -12, 3]]) {
      ellipse(ctx, cx + dx, cy + dy, r, r * 0.8); ctx.fill()
    }
  } else if (cat.pattern === 'tuxedo') {
    ctx.fillStyle = '#fdf8ee'
    ellipse(ctx, cx, cy + ry * 0.45, rx * 0.62, ry * 0.5); ctx.fill()
  }
  ctx.restore()
}

function ear(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, color: string, inner = true) {
  ctx.beginPath()
  ctx.moveTo(x - 8 * dir, y + 5)
  ctx.lineTo(x + 1 * dir, y - 14)
  ctx.lineTo(x + 9 * dir, y + 4)
  ctx.closePath()
  fillStroke(ctx, color, 3.5)
  if (inner) {
    ctx.beginPath()
    ctx.moveTo(x - 4 * dir, y + 3)
    ctx.lineTo(x + 1 * dir, y - 9)
    ctx.lineTo(x + 5 * dir, y + 2)
    ctx.closePath()
    ctx.fillStyle = '#f2a0b0'
    ctx.fill()
  }
}

function eyes(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, blink: boolean, asleep: boolean) {
  for (const s of [-1, 1]) {
    const ex = x + s * dx
    if (asleep || blink) {
      ctx.beginPath(); ctx.arc(ex, y, 4.5, 0.15 * Math.PI, 0.85 * Math.PI)
      ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke()
    } else {
      ellipse(ctx, ex, y, 4.6, 5.6)
      fillStroke(ctx, '#fff', 2.5)
      ctx.beginPath(); ctx.arc(ex, y + 1.4, 2.4, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill()
      ctx.beginPath(); ctx.arc(ex - 1, y - 0.4, 0.9, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill()
    }
  }
}

function whiskers(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.lineWidth = 1.4; ctx.strokeStyle = INK
  for (const s of [-1, 1]) for (let i = -1; i <= 1; i++) {
    ctx.beginPath()
    ctx.moveTo(x + s * 8, y + i * 2.5)
    ctx.lineTo(x + s * 20, y + i * 4.5 - 1)
    ctx.stroke()
  }
}

function accessory(ctx: CanvasRenderingContext2D, cat: CatCustom, hx: number, hy: number, facing: Facing) {
  if (cat.accessory === 'hat') {
    ctx.save()
    ctx.translate(hx - 4, hy - 17); ctx.rotate(-0.18)
    ctx.beginPath(); ctx.rect(-11, 0, 22, 3.5)
    fillStroke(ctx, INK, 3)
    ctx.beginPath(); ctx.rect(-7, -13, 14, 13)
    fillStroke(ctx, '#2b2b30', 3)
    ctx.fillStyle = '#e24141'; ctx.fillRect(-7, -5, 14, 4)
    ctx.restore()
  } else if (cat.accessory === 'bowtie' && (facing === 'down' || facing === 'left' || facing === 'right')) {
    const by = facing === 'down' ? hy + 13 : hy + 11
    const bx = facing === 'down' ? hx : hx - 4
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - 9, by - 6); ctx.lineTo(bx - 9, by + 6); ctx.closePath()
    fillStroke(ctx, '#e24141', 2.5)
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + 9, by - 6); ctx.lineTo(bx + 9, by + 6); ctx.closePath()
    fillStroke(ctx, '#e24141', 2.5)
    ctx.beginPath(); ctx.arc(bx, by, 3.2, 0, Math.PI * 2); fillStroke(ctx, '#b01f1f', 2)
  } else if (cat.accessory === 'glasses' && facing !== 'up') {
    ctx.lineWidth = 2.4; ctx.strokeStyle = INK
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(hx + s * 6, hy, 6, 0, Math.PI * 2); ctx.stroke() }
    ctx.beginPath(); ctx.moveTo(hx - 0.5, hy); ctx.lineTo(hx + 0.5, hy); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(hx - 12, hy - 1); ctx.lineTo(hx - 15, hy - 3); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(hx + 12, hy - 1); ctx.lineTo(hx + 15, hy - 3); ctx.stroke()
  }
}

// The main entry. (x,y) is the cat's feet-center. phase drives walk/tail anim.
export function drawCat(ctx: CanvasRenderingContext2D, x: number, y: number, cat: CatCustom, facing: Facing, pose: Pose, phase: number) {
  const blink = (phase % 3.4) < 0.12
  const bob = pose === 'walk' ? Math.sin(phase * 10) * 1.6 : 0

  ctx.save()
  ctx.translate(x, y)
  // soft blob shadow
  ctx.beginPath()
  ctx.ellipse(0, 15, 20, 7, 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(20,16,12,0.18)'
  ctx.fill()
  ctx.translate(0, bob)

  const side = facing === 'left' || facing === 'right'
  if (facing === 'left') ctx.scale(-1, 1)

  const dark = shade(cat.color, -55)

  if (pose === 'sleep') {
    // curled-up ball: body, wrapped tail, tucked head, no face but closed eyes
    ellipse(ctx, 0, 4, 19, 15)
    fillStroke(ctx, cat.color, 4)
    ctx.save()
    ellipse(ctx, 0, 4, 17, 13); ctx.clip()
    if (cat.pattern === 'tabby') {
      ctx.strokeStyle = dark; ctx.lineWidth = 4
      for (const r of [8, 14]) { ctx.beginPath(); ctx.arc(0, 4, r, -0.6, 1.6); ctx.stroke() }
    } else if (cat.pattern === 'spots') {
      ctx.fillStyle = dark
      for (const [dx, dy, r] of [[-8, 0, 4], [4, 8, 3.5], [10, -2, 3]]) { ellipse(ctx, dx, 4 + dy, r, r * 0.8); ctx.fill() }
    }
    ctx.restore()
    ctx.beginPath(); ctx.arc(-13, 12, 15, Math.PI * 0.9, Math.PI * 1.95)
    ctx.lineWidth = 10; ctx.strokeStyle = INK; ctx.stroke()
    ctx.lineWidth = 6; ctx.strokeStyle = cat.color; ctx.stroke()
    ellipse(ctx, 9, -4, 11, 10)
    fillStroke(ctx, cat.color, 4)
    ear(ctx, 4, -12, 1, cat.color)
    ear(ctx, 14, -10, 1, cat.color)
    eyes(ctx, 10, -4, 4.5, false, true)
    ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(14, 2); ctx.lineTo(10, 2); ctx.closePath()
    ctx.fillStyle = '#f2a0b0'; ctx.fill()
    ctx.restore()
    return
  }

  if (!side) {
    // ---- front / back view ------------------------------------------
    const sit = pose === 'sit'
    const bw = sit ? 17 : 15, bh = sit ? 21 : 19
    if (facing === 'down') tail(ctx, cat.color, 0, 14, phase, true)
    else tailBack(ctx, cat.color, phase)
    if (facing === 'down') {
      // body below head
      ellipse(ctx, 0, 6, bw, bh)
      fillStroke(ctx, cat.color, 4)
      bodyPattern(ctx, cat, 0, 6, bw, bh)
      if (pose === 'walk') drawFeet(ctx, cat, phase)
    } else {
      ellipse(ctx, 0, 2, bw, bh + 2)
      fillStroke(ctx, cat.color, 4)
      bodyPattern(ctx, cat, 0, 2, bw, bh + 2)
      if (pose === 'walk') drawFeet(ctx, cat, phase)
    }
    const hy = sit || facing === 'down' ? -14 : -12
    const headY = pose === 'eat' ? hy + 7 : hy
    ctx.beginPath(); ctx.arc(0, headY, 15, 0, Math.PI * 2)
    fillStroke(ctx, cat.color, 4)
    ear(ctx, -9, headY - 12, -1, cat.color, facing !== 'up')
    ear(ctx, 9, headY - 12, 1, cat.color, facing !== 'up')
    if (cat.pattern === 'tabby') {
      ctx.strokeStyle = dark; ctx.lineWidth = 2.6
      for (const s of [-1, 0, 1]) {
        ctx.beginPath(); ctx.moveTo(s * 5 - 1, headY - 13); ctx.lineTo(s * 5, headY - 8); ctx.stroke()
      }
    }
    if (facing === 'down') {
      eyes(ctx, 0, headY - 1, 6.5, blink, false)
      if (cat.pattern === 'tuxedo') {
        ellipse(ctx, 0, headY + 7, 7, 5)
        ctx.fillStyle = '#fdf8ee'; ctx.fill()
      }
      ctx.beginPath(); ctx.moveTo(-2.5, headY + 4); ctx.lineTo(2.5, headY + 4); ctx.lineTo(0, headY + 7); ctx.closePath()
      fillStroke(ctx, '#f2a0b0', 2)
      whiskers(ctx, 0, headY + 5)
    }
    accessory(ctx, cat, 0, headY, facing)
  } else {
    // ---- side view (drawn facing right; flipped for left) ------------
    tail(ctx, cat.color, -17, 4, phase)
    ellipse(ctx, 0, 3, 20, 13)
    fillStroke(ctx, cat.color, 4)
    bodyPattern(ctx, cat, 0, 3, 20, 13)
    if (pose === 'walk') {
      ctx.lineWidth = 4; ctx.strokeStyle = INK
      const s1 = Math.sin(phase * 10), s2 = Math.sin(phase * 10 + Math.PI)
      for (const [lx, sv] of [[8, s1], [-6, s2]] as const) {
        ctx.beginPath(); ctx.moveTo(lx, 12); ctx.lineTo(lx + sv * 4, 18); ctx.stroke()
      }
    }
    ctx.beginPath(); ctx.arc(15, -8, 13, 0, Math.PI * 2)
    fillStroke(ctx, cat.color, 4)
    ear(ctx, 8, -18, -1, cat.color)
    ear(ctx, 17, -20, 1, cat.color)
    if (cat.pattern === 'tabby') {
      ctx.strokeStyle = dark; ctx.lineWidth = 2.4
      for (const s of [0, 1]) {
        ctx.beginPath(); ctx.moveTo(10 + s * 5, -20); ctx.lineTo(11 + s * 5, -15); ctx.stroke()
      }
    }
    eyes(ctx, 15, -8, 5.5, blink, false)
    ctx.beginPath(); ctx.moveTo(24.5, -3); ctx.lineTo(28.5, -4.5); ctx.lineTo(25.5, -0.5); ctx.closePath()
    fillStroke(ctx, '#f2a0b0', 2)
    ctx.lineWidth = 1.4; ctx.strokeStyle = INK
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(22, -2 + i * 2); ctx.lineTo(33, -4 + i * 3.5); ctx.stroke()
    }
    accessory(ctx, cat, 15, -8, facing)
  }
  ctx.restore()
}

function drawFeet(ctx: CanvasRenderingContext2D, cat: CatCustom, phase: number) {
  const s1 = Math.sin(phase * 10), s2 = Math.sin(phase * 10 + Math.PI)
  const paw = cat.pattern === 'tuxedo' ? '#fdf8ee' : cat.color
  for (const [fx, sv] of [[-8, s1], [8, s2]] as const) {
    ellipse(ctx, fx, 24 + sv * 2, 5, 4)
    fillStroke(ctx, paw, 2.5)
  }
}
