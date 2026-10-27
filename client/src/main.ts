// Meow Mansion client: game loop, networking glue, interaction logic.

import { Socket } from './net'
import { initInput, setChatOpen, moveVector } from './input'
import { spawn, updateFx } from './effects'
import { WORLD, collide, roomAt, furnitureAt, nearestInteractable, OBJECT_BY_ID, type InteractTarget } from './house'
import { render, type RenderCat } from './render'
import { captionBox, INK } from './comic'
import { showCustomize, hideCustomize, setStatus } from './customize'
import { sfx } from './sfx'
import type { Facing, Player, Pose, ServerMsg } from './types'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const chatbox = document.getElementById('chatbox') as HTMLInputElement
const hudroom = document.getElementById('hudroom')!

let vw = 0, vh = 0
function resize() {
  vw = window.innerWidth; vh = window.innerHeight
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = vw * dpr; canvas.height = vh * dpr
  canvas.style.width = vw + 'px'; canvas.style.height = vh + 'px'
}
window.addEventListener('resize', resize); resize()

// -------------------------------------------------------------- state ----

interface Remote extends Player { tx: number; ty: number; phase: number }
interface Me extends Player { phase: number }

const sock = new Socket()
let me: Me | null = null
let myId = ''
let roomName = ''
const remotes = new Map<string, Remote>()
let objects: Record<string, string> = {}
let toggles: Record<string, boolean> = {}
let damageCouch = 0
const lasers = new Map<string, { x: number; y: number }>()
const zoomUntil = new Map<string, number>() // per-cat zoomies expiry (incl me)

let playing = false
let time = 0
let cam = { x: 0, y: 0 }
let caption = { text: '', t: 99 }
let currentRoom = ''
let interactTarget: InteractTarget | null = null
let eatUntil = 0
let laserOn = false
let mouse = { x: 0, y: 0 }
let lastPosSend = 0, lastPos = { x: 0, y: 0, facing: 'down' as Facing, pose: 'stand' as Pose }
let lastLaserSend = 0
let ambientTimer = 0

const catPos = (id: string) =>
  id === myId ? (me ? { x: me.x, y: me.y } : null) : (remotes.get(id) ?? null)

// ---------------------------------------------------------- networking ---

function handle(msg: ServerMsg) {
  switch (msg.t) {
    case 'welcome': {
      myId = msg.id
      objects = msg.objects; toggles = msg.toggles; damageCouch = msg.damage.couch
      for (const p of msg.players) {
        if (p.id === myId) me = { ...p, phase: 0 }
        else remotes.set(p.id, { ...p, tx: p.x, ty: p.y, phase: Math.random() * 10 })
      }
      playing = true
      hideCustomize()
      caption = { text: 'MEOW MANSION', t: 0 }
      hudroom.textContent = `${msg.room} · ${remotes.size + 1} cat${remotes.size ? 's' : ''}`
      sfx.pop()
      break
    }
    case 'join': {
      remotes.set(msg.player.id, { ...msg.player, tx: msg.player.x, ty: msg.player.y, phase: Math.random() * 10 })
      hudroom.textContent = `${roomName} · ${remotes.size + 1} cats`
      spawn('burst', msg.player.x, msg.player.y - 30, { text: 'A NEW CAT!', ttl: 1.4 })
      break
    }
    case 'leave': {
      remotes.delete(msg.id); lasers.delete(msg.id); zoomUntil.delete(msg.id)
      hudroom.textContent = `${roomName} · ${remotes.size + 1} cat${remotes.size === 1 ? '' : 's'}`
      break
    }
    case 'pos': {
      const r = remotes.get(msg.id)
      if (r) { r.tx = msg.x; r.ty = msg.y; r.facing = msg.facing; r.pose = msg.pose }
      break
    }
    case 'chat': spawn('bubble', 0, 0, { text: msg.text, follow: msg.id, ttl: 4 }); break
    case 'emote': onEmote(msg.id, msg.kind, msg.target); break
    case 'obj': {
      objects[msg.id] = msg.state
      if (msg.state === 'on' || msg.state === 'off') toggles[msg.id] = msg.state === 'on'
      const o = OBJECT_BY_ID.get(msg.id)
      if (o && msg.state === 'broken') {
        if (o.kind === 'tp') {
          spawn('burst', o.x, o.y - 20, { text: 'WHIRR!', ttl: 1 })
          spawn('paper', o.x, o.y, { ttl: 1.6 })
        } else {
          spawn('burst', o.x, o.y - 16, { text: 'KER-PLUNK!', ttl: 1.1 })
          spawn('shards', o.x, o.y, { ttl: 6 })
          sfx.plunk()
        }
      } else if (o && msg.state === 'ok') {
        spawn('puff', o.x, o.y, { ttl: 0.5 })
      }
      break
    }
    case 'dmg':
      damageCouch = msg.count
      spawn('burst', msg.x, msg.y - 40, { text: 'SKRRRT!', ttl: 1 })
      sfx.plunk()
      break
    case 'laser':
      if (msg.on) lasers.set(msg.id, { x: msg.x, y: msg.y })
      else lasers.delete(msg.id)
      break
    case 'err': setStatus(msg.msg); break
  }
}

function onEmote(id: string, kind: string, target: string) {
  const p = catPos(id)
  const tp = target ? catPos(target) : null
  if (kind === 'boop' && tp) {
    spawn('burst', tp.x, tp.y - 36, { text: 'BOOP!', ttl: 1 })
    spawn('hearts', tp.x, tp.y - 10, { ttl: 1.4 })
    sfx.pop()
    return
  }
  if (!p) return
  switch (kind) {
    case 'meow': spawn('burst', p.x, p.y - 44, { text: 'MEOW!', ttl: 0.9 }); sfx.meow(); break
    case 'hiss': spawn('burst', p.x, p.y - 44, { text: 'HISS!', ttl: 0.9 }); spawn('angry', p.x, p.y - 20, { ttl: 0.8 }); sfx.hiss(); break
    case 'purr': spawn('hearts', p.x, p.y - 16, { ttl: 1.6 }); sfx.pop(); break
    case 'zoom': spawn('burst', p.x, p.y - 44, { text: 'ZOOMIES!!', ttl: 1 }); zoomUntil.set(id, time + 1.8); sfx.pop(); break
    case 'boop': spawn('burst', p.x + 20, p.y - 40, { text: 'boop?', ttl: 0.8 }); break
  }
}

// ---------------------------------------------------------- join flow ----

sock.onMsg = handle
sock.onOpen = () => {}
sock.onClose = () => {
  if (playing) setStatus('connection lost — refresh to rejoin')
}

showCustomize(({ name, room, cat }) => {
  roomName = room
  sock.onOpen = () => {
    // spawn in the hall, jittered so cats don't stack perfectly
    const j = Math.floor(Math.random() * 60)
    sock.send({ t: 'join', room, name, cat, x: 650 + j - 30, y: 600 + j - 30 })
  }
  sock.connect()
})

// -------------------------------------------------------------- input ----

function openChat() {
  setChatOpen(true)
  chatbox.hidden = false
  chatbox.value = ''
  chatbox.focus()
}
function closeChat() {
  chatbox.hidden = true
  setChatOpen(false)
  canvas.focus()
}
chatbox.addEventListener('keydown', (e) => {
  e.stopPropagation()
  if (e.key === 'Enter') {
    const text = chatbox.value.trim()
    if (text) sock.send({ t: 'chat', text })
    closeChat()
  } else if (e.key === 'Escape') closeChat()
})
chatbox.addEventListener('blur', closeChat)

initInput(
  () => { if (playing) openChat() },
  (n) => {
    if (!playing || !me) return
    if (n === 5) {
      // boop the nearest other cat in range
      let best: Remote | null = null, bd = 75
      for (const r of remotes.values()) {
        const d = Math.hypot(r.x - me.x, r.y - me.y)
        if (d < bd) { bd = d; best = r }
      }
      sock.send({ t: 'emote', kind: 'boop', target: best?.id ?? '' })
    } else {
      sock.send({ t: 'emote', kind: ['meow', 'hiss', 'purr', 'zoom'][n - 1] })
    }
  },
  interact,
  () => {
    if (!playing) return
    laserOn = !laserOn
    if (!laserOn) sock.send({ t: 'laser', on: false, x: 0, y: 0 })
    else spawn('burst', mouseWorld().x, mouseWorld().y, { text: 'PEW!', ttl: 0.5 })
  },
)

canvas.addEventListener('mousemove', (e) => { mouse = { x: e.clientX, y: e.clientY } })
canvas.addEventListener('mousedown', (e) => {
  // clicking while laser mode is off = a casual paw tap toward that spot? keep it: pet?
  void e
})

function mouseWorld() { return { x: mouse.x + cam.x, y: mouse.y + cam.y } }

// -------------------------------------------------------- interactions ---

function interact() {
  if (!playing || !me || !interactTarget) return
  const t = interactTarget
  if (t.type === 'object' && t.object) {
    sock.send({ t: 'act', id: t.object.id, kind: 'knock' })
    return
  }
  const f = t.furniture!
  switch (f.interact) {
    case 'eat': eatUntil = time + 1.6; spawn('burst', me.x, me.y - 40, { text: 'NOM NOM', ttl: 0.9 }); sfx.pop(); break
    case 'dig': spawn('puff', t.x, t.y + 20, { ttl: 0.8 }); spawn('stink', t.x, t.y + 10, { ttl: 2.2 }); spawn('burst', me.x, me.y - 40, { text: 'dig dig', ttl: 0.8 }); break
    case 'splash': spawn('splash', t.x, t.y, { ttl: 0.7 }); sfx.splish(); break
    case 'flush': spawn('splash', t.x, t.y, { ttl: 0.9 }); spawn('burst', t.x, t.y - 50, { text: 'FWOOSH!', ttl: 0.9 }); sfx.splish(); break
    case 'scratch': sock.send({ t: 'dmg', kind: 'couch', x: me.x, y: me.y }); break
    case 'scratchgood': spawn('burst', me.x, me.y - 40, { text: 'SKRIITCH', ttl: 0.9 }); spawn('hearts', me.x, me.y - 10, { ttl: 1 }); sfx.pop(); break
    case 'tv': sock.send({ t: 'act', id: 'tv1', kind: 'toggle' }); break
    case 'lamp': sock.send({ t: 'act', id: 'lamp1', kind: 'toggle' }); break
    case 'chomp': spawn('burst', me.x, me.y - 40, { text: 'CHOMP', ttl: 0.8 }); spawn('paper', t.x, t.y, { ttl: 1, color: '#7fb356' }); break
    case 'rustle': spawn('burst', t.x, t.y - 30, { text: 'FWOOSH', ttl: 0.8 }); spawn('paper', t.x, t.y - 40, { ttl: 1.4, color: '#7fb356' }); break
    case 'stove': {
      spawn('burst', me.x, me.y - 40, { text: 'SSSS!', ttl: 0.8 })
      spawn('angry', me.x, me.y - 10, { ttl: 0.8 })
      sfx.hiss()
      // recoil away from the stove
      const dx = me.x - t.x, dy = me.y - t.y, d = Math.hypot(dx, dy) || 1
      const p = collide(me.x + (dx / d) * 40, me.y + (dy / d) * 40)
      me.x = p.x; me.y = p.y
      break
    }
    case 'fridge': spawn('bubble', 0, 0, { text: 'snacks??', follow: myId, ttl: 2.2 }); sfx.meow(); break
  }
}

// ------------------------------------------------------------- update ----

function update(dt: number) {
  if (!playing || !me) return
  const { dx, dy } = moveVector()
  const zooming = time < (zoomUntil.get(myId) ?? 0)
  const speed = zooming ? 300 : 150
  const moving = dx !== 0 || dy !== 0

  if (moving) {
    const p = collide(me.x + dx * speed * dt, me.y + dy * speed * dt)
    me.x = p.x; me.y = p.y
    me.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')
  }

  // pose: walking > timed eat/dig > furniture auto-pose > stand
  const under = furnitureAt(me.x, me.y)
  if (moving) me.pose = 'walk'
  else if (time < eatUntil) me.pose = 'eat'
  else if (under?.autoPose) me.pose = under.autoPose
  else me.pose = 'stand'

  me.phase += dt * (moving ? 2.2 : 1)

  // ambient periodic effects
  ambientTimer -= dt
  if (ambientTimer <= 0) {
    ambientTimer = 1.1
    if (me.pose === 'sleep') spawn('zzz', me.x, me.y, { ttl: 1.6 })
    if (under?.id === 'litter') spawn('puff', me.x + (Math.random() - 0.5) * 30, me.y + 10, { ttl: 0.7 })
  }
  if (zooming && Math.floor(time * 14) !== Math.floor((time - dt) * 14)) {
    spawn('lines', me.x, me.y, { ttl: 0.35 })
  }

  // position updates, ~12hz, only when something changed
  if (time - lastPosSend > 0.08 &&
      (me.x !== lastPos.x || me.y !== lastPos.y || me.facing !== lastPos.facing || me.pose !== lastPos.pose)) {
    lastPosSend = time
    lastPos = { x: me.x, y: me.y, facing: me.facing, pose: me.pose }
    sock.send({ t: 'pos', ...lastPos })
  }

  // laser dot follows the mouse for everyone
  if (laserOn && time - lastLaserSend > 0.066) {
    lastLaserSend = time
    const w = mouseWorld()
    sock.send({ t: 'laser', on: true, x: w.x, y: w.y })
  }

  // remote cats: lerp toward target, spin their anim phase
  for (const r of remotes.values()) {
    const d = Math.hypot(r.tx - r.x, r.ty - r.y)
    const k = Math.min(1, dt * 10)
    r.x += (r.tx - r.x) * k
    r.y += (r.ty - r.y) * k
    r.phase += dt * (d > 2 ? 2.2 : 1)
    if (time < (zoomUntil.get(r.id) ?? 0) && Math.floor(time * 14) !== Math.floor((time - dt) * 14)) {
      spawn('lines', r.x, r.y, { ttl: 0.35 })
    }
  }

  // room-change caption card
  const room = roomAt(me.x, me.y)
  if (room && room.name !== currentRoom) {
    currentRoom = room.name
    caption = { text: room.caption, t: 0 }
  }
  caption.t += dt

  interactTarget = nearestInteractable(me.x, me.y)

  // camera follows, clamped (or centred if the world fits)
  cam.x = WORLD.w <= vw ? (WORLD.w - vw) / 2 : Math.min(WORLD.w - vw, Math.max(0, me.x - vw / 2))
  cam.y = WORLD.h <= vh ? (WORLD.h - vh) / 2 : Math.min(WORLD.h - vh, Math.max(0, me.y - vh / 2))

  updateFx(dt, catPos)
}

// ------------------------------------------------------------- render ----

function draw() {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#14100c'
  ctx.fillRect(0, 0, vw, vh)

  if (!playing || !me) return

  ctx.save()
  ctx.translate(-cam.x, -cam.y)

  const cats: RenderCat[] = [me, ...remotes.values()].map((c) => ({
    id: c.id, name: c.name, cat: c.cat,
    x: c.x, y: c.y, facing: c.facing, pose: c.pose, phase: c.phase,
  }))

  let nearBirdbath = 999
  for (const c of cats) nearBirdbath = Math.min(nearBirdbath, Math.hypot(c.x - 352, c.y - 820))

  render(ctx, {
    cats, objects, toggles, damageCouch,
    lasers: [...lasers.values()],
    time, nearBirdbath,
    interact: interactTarget, myId,
  })
  ctx.restore()

  // comic panel frame
  ctx.strokeStyle = INK; ctx.lineWidth = 10
  ctx.strokeRect(5, 5, vw - 10, vh - 10)

  // narration caption
  if (caption.t < 3.4) captionBox(ctx, 22, 22, caption.text, caption.t / 3.4)
}

let prev = performance.now()
function frame(now: number) {
  const dt = Math.min(0.05, (now - prev) / 1000)
  prev = now
  time += dt
  update(dt)
  draw()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
