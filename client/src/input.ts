// Keyboard state. Chat input and the join form live in the DOM, so when
// either has focus we swallow keys there instead of here.

export const keys = new Set<string>()
let chatOpen = false

export function initInput(onChat: () => void, onEmote: (n: number) => void, onInteract: () => void, onLaser: () => void) {
  window.addEventListener('keydown', (e) => {
    if (chatOpen) return
    const k = e.key.toLowerCase()
    if (k === 'enter') { e.preventDefault(); onChat(); return }
    if (k === 'e') { onInteract(); return }
    if (k === 'l') { onLaser(); return }
    if (k >= '1' && k <= '5') { onEmote(Number(k)); return }
    keys.add(k)
  })
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()))
  window.addEventListener('blur', () => keys.clear())
}

export function setChatOpen(open: boolean) {
  chatOpen = open
  if (open) keys.clear()
}

export function moveVector(): { dx: number; dy: number } {
  let dx = 0, dy = 0
  if (keys.has('a') || keys.has('arrowleft')) dx -= 1
  if (keys.has('d') || keys.has('arrowright')) dx += 1
  if (keys.has('w') || keys.has('arrowup')) dy -= 1
  if (keys.has('s') || keys.has('arrowdown')) dy += 1
  if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2 }
  return { dx, dy }
}
