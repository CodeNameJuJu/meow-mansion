// The join screen: design your cat, pick a name, move in.
// Lives in the DOM so it's easy to click; the preview is a canvas loop
// running the real drawCat so what you see is what you get.

import { drawCat } from './catdraw'
import type { CatCustom, Pattern, Accessory } from './types'

const COLORS = [
  ['#f0943c', 'classic orange'], ['#3a3a3f', 'void cat'], ['#9aa0a8', 'fancy grey'],
  ['#f5efe2', 'cream'], ['#8a5a34', 'chocolate'], ['#e8a8bf', 'bubblegum'],
  ['#8fb8e8', 'denim'], ['#a8d47a', 'shrek'],
] as const
const PATTERNS: [Pattern, string][] = [['none', 'Solid'], ['tabby', 'Tabby'], ['spots', 'Spots'], ['tuxedo', 'Tuxedo']]
const ACCESSORIES: [Accessory, string][] = [['none', 'None'], ['hat', 'Top hat'], ['bowtie', 'Bowtie'], ['glasses', 'Glasses']]
const NAMES = ['Biscuit', 'Chairman Meow', 'Soup', 'Professor Beans', 'Noodle', 'Crumb', 'Judge Muffin', 'Socks', 'Goose', 'Waffles']

export interface JoinInfo { name: string; room: string; cat: CatCustom }

export function showCustomize(onJoin: (info: JoinInfo) => void) {
  const panel = document.getElementById('customize')!
  const preview = document.getElementById('preview') as HTMLCanvasElement
  const nameInput = document.getElementById('catname') as HTMLInputElement
  const roomInput = document.getElementById('room') as HTMLInputElement
  const status = document.getElementById('status')!

  const cat: CatCustom = { color: '#f0943c', pattern: 'tabby', accessory: 'none' }
  try {
    const saved = JSON.parse(localStorage.getItem('meow-mansion') ?? 'null')
    if (saved?.cat) Object.assign(cat, saved.cat)
    if (saved?.name) nameInput.value = saved.name
    if (saved?.room) roomInput.value = saved.room
  } catch { /* fresh start */ }
  if (!nameInput.value) nameInput.value = NAMES[Math.floor(Math.random() * NAMES.length)]

  let group = (id: string, items: readonly (readonly [string, string])[], get: () => string, set: (v: string) => void) => {
    const el = document.getElementById(id)!
    el.innerHTML = ''
    for (const [v, label] of items) {
      const b = document.createElement('button')
      b.className = 'pick' + (get() === v ? ' on' : '')
      b.textContent = label
      if (id === 'colors') b.style.background = v
      b.onclick = () => { set(v); for (const c of el.children) c.classList.remove('on'); b.classList.add('on') }
      el.appendChild(b)
    }
  }
  group('colors', COLORS, () => cat.color, (v) => (cat.color = v))
  group('patterns', PATTERNS, () => cat.pattern, (v) => (cat.pattern = v as Pattern))
  group('accessories', ACCESSORIES, () => cat.accessory, (v) => (cat.accessory = v as Accessory))

  // live preview
  const pctx = preview.getContext('2d')!
  let t0 = performance.now()
  const tick = (now: number) => {
    if (panel.hidden) return
    const ph = (now - t0) / 1000
    pctx.clearRect(0, 0, preview.width, preview.height)
    pctx.save()
    pctx.translate(preview.width / 2, preview.height / 2 + 30)
    pctx.scale(2.2, 2.2)
    drawCat(pctx, 0, 0, cat, 'down', ph % 4 < 2 ? 'stand' : 'walk', ph)
    pctx.restore()
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  panel.hidden = false
  document.getElementById('join')!.onclick = () => {
    const name = nameInput.value.trim() || 'stray cat'
    const room = roomInput.value.trim().toLowerCase() || 'mansion'
    localStorage.setItem('meow-mansion', JSON.stringify({ name, room, cat }))
    status.textContent = 'knocking on the door…'
    onJoin({ name, room, cat: { ...cat } })
  }
}

export function hideCustomize() {
  document.getElementById('customize')!.hidden = true
  document.getElementById('hud')!.hidden = false
}

export function setStatus(text: string) {
  const s = document.getElementById('status')
  if (s) s.textContent = text
}
