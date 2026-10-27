// The mansion: rooms, walls, furniture and things cats can ruin.
// Coordinates are world pixels. Interior bounds: x 60..1620, y 60..1100.

export const WORLD = { w: 1680, h: 1160 }
export const CAT_R = 13 // cat collision radius

export interface Rect { x: number; y: number; w: number; h: number }
export const inRect = (r: Rect, x: number, y: number) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
const circleHits = (r: Rect, x: number, y: number, rad: number) =>
  x + rad > r.x && x - rad < r.x + r.w && y + rad > r.y && y - rad < r.y + r.h

// ------------------------------------------------------------- rooms -----

export type FloorKind = 'tile' | 'wood' | 'carpet' | 'grass' | 'bath'

export interface Room { name: string; caption: string; rect: Rect; floor: FloorKind }

export const ROOMS: Room[] = [
  { name: 'kitchen', caption: 'MEANWHILE, IN THE KITCHEN…', rect: { x: 60, y: 60, w: 480, h: 380 }, floor: 'tile' },
  { name: 'bedroom', caption: 'MEANWHILE, IN THE BEDROOM…', rect: { x: 760, y: 60, w: 860, h: 380 }, floor: 'carpet' },
  { name: 'bathroom', caption: 'MEANWHILE, IN THE BATHROOM…', rect: { x: 60, y: 460, w: 480, h: 240 }, floor: 'bath' },
  { name: 'garden', caption: 'MEANWHILE, OUT IN THE GARDEN…', rect: { x: 60, y: 720, w: 480, h: 380 }, floor: 'grass' },
  { name: 'hall', caption: 'MEANWHILE, IN THE HALLWAY…', rect: { x: 560, y: 60, w: 180, h: 1040 }, floor: 'wood' },
  { name: 'living', caption: 'MEANWHILE, IN THE LIVING ROOM…', rect: { x: 760, y: 460, w: 860, h: 640 }, floor: 'wood' },
]

export function roomAt(x: number, y: number): Room | null {
  for (const r of ROOMS) if (inRect(r.rect, x, y)) return r
  return null
}

// ------------------------------------------------------------- walls -----

export const WALLS: Rect[] = [
  // outer shell
  { x: 40, y: 40, w: 1600, h: 20 },
  { x: 40, y: 1100, w: 1600, h: 20 },
  { x: 40, y: 60, w: 20, h: 1040 },
  { x: 1620, y: 60, w: 20, h: 1040 },
  // west column / hall divider (x540..560), doors at y200-290, 520-610, 880-970
  { x: 540, y: 60, w: 20, h: 140 },
  { x: 540, y: 290, w: 20, h: 230 },
  { x: 540, y: 610, w: 20, h: 270 },
  { x: 540, y: 970, w: 20, h: 130 },
  // hall / east divider (x740..760), doors at y200-290, 700-790
  { x: 740, y: 60, w: 20, h: 140 },
  { x: 740, y: 290, w: 20, h: 410 },
  { x: 740, y: 790, w: 20, h: 310 },
  // kitchen / bathroom split (y440..460), door at x280-380
  { x: 40, y: 440, w: 240, h: 20 },
  { x: 380, y: 440, w: 180, h: 20 },
  // bathroom / garden split (y700..720), door at x280-380
  { x: 40, y: 700, w: 240, h: 20 },
  { x: 380, y: 700, w: 180, h: 20 },
  // bedroom / living split (y440..460), door at x1100-1200
  { x: 740, y: 440, w: 360, h: 20 },
  { x: 1200, y: 440, w: 440, h: 20 },
]

// --------------------------------------------------------- furniture -----

export type InteractKind =
  | 'eat' | 'dig' | 'splash' | 'flush' | 'tp' | 'scratch' | 'scratchgood'
  | 'tv' | 'lamp' | 'chomp' | 'rustle' | 'stove' | 'fridge' | 'knock'

export interface Furniture {
  id: string
  kind: string           // drawing style
  label: string
  rect: Rect
  solid: boolean
  walkable?: boolean     // cats can stand on it (tables, bed, couch)
  autoPose?: 'sit' | 'sleep' | 'eat' // pose while idling inside the rect
  interact?: InteractKind
  prompt?: string        // shown in the "E" bubble
}

export const FURNITURE: Furniture[] = [
  // kitchen
  { id: 'fridge', kind: 'fridge', label: 'the fridge', rect: { x: 80, y: 80, w: 84, h: 110 }, solid: true, interact: 'fridge', prompt: 'stare at the fridge' },
  { id: 'counter', kind: 'counter', label: 'the counter', rect: { x: 170, y: 80, w: 350, h: 50 }, solid: true },
  { id: 'stove', kind: 'stove', label: 'the stove', rect: { x: 310, y: 84, w: 100, h: 42 }, solid: true, interact: 'stove', prompt: 'touch the stove (bad idea)' },
  { id: 'table', kind: 'table', label: 'the table', rect: { x: 300, y: 230, w: 150, h: 90 }, solid: false, walkable: true },
  { id: 'bowl1', kind: 'bowl', label: 'the food bowl', rect: { x: 96, y: 358, w: 38, h: 28 }, solid: false, interact: 'eat', prompt: 'have a snack' },
  { id: 'bowl2', kind: 'bowl', label: 'the other bowl', rect: { x: 146, y: 358, w: 38, h: 28 }, solid: false, interact: 'eat', prompt: 'have a snack' },

  // bedroom
  { id: 'bed', kind: 'bed', label: 'the bed', rect: { x: 1300, y: 90, w: 270, h: 170 }, solid: false, walkable: true, autoPose: 'sleep' },
  { id: 'dresser', kind: 'dresser', label: 'the dresser', rect: { x: 790, y: 80, w: 170, h: 60 }, solid: true },
  { id: 'nightstand', kind: 'nightstand', label: 'the lamp', rect: { x: 1210, y: 90, w: 70, h: 70 }, solid: true, interact: 'lamp', prompt: 'flick the lamp' },
  { id: 'rugB', kind: 'rug', label: 'a rug', rect: { x: 980, y: 240, w: 220, h: 120 }, solid: false },

  // bathroom
  { id: 'sink', kind: 'sink', label: 'the sink', rect: { x: 80, y: 470, w: 80, h: 60 }, solid: true, interact: 'splash', prompt: 'bat at the tap' },
  { id: 'toilet', kind: 'toilet', label: 'the toilet', rect: { x: 180, y: 470, w: 55, h: 70 }, solid: true, interact: 'flush', prompt: 'flush it' },
  { id: 'tub', kind: 'tub', label: 'the tub', rect: { x: 80, y: 570, w: 140, h: 110 }, solid: true, interact: 'splash', prompt: 'fear the water' },
  { id: 'litter', kind: 'litter', label: 'the litter box', rect: { x: 360, y: 580, w: 150, h: 90 }, solid: false, walkable: true, autoPose: 'eat', interact: 'dig', prompt: 'dig. dig dig dig.' },

  // garden
  { id: 'tree', kind: 'tree', label: 'the tree', rect: { x: 125, y: 800, w: 34, h: 50 }, solid: true, interact: 'rustle', prompt: 'attack the tree' },
  { id: 'bush', kind: 'bush', label: 'a suspicious bush', rect: { x: 380, y: 1000, w: 70, h: 55 }, solid: true, interact: 'rustle', prompt: 'rustle the bush' },
  { id: 'birdbath', kind: 'birdbath', label: 'the birdbath', rect: { x: 330, y: 810, w: 44, h: 40 }, solid: true, interact: 'splash', prompt: 'splash the birdbath' },

  // living room
  { id: 'tvstand', kind: 'tvstand', label: 'the TV', rect: { x: 1040, y: 480, w: 170, h: 55 }, solid: true, interact: 'tv', prompt: 'flick the TV' },
  { id: 'couch', kind: 'couch', label: 'the couch', rect: { x: 990, y: 650, w: 290, h: 85 }, solid: false, walkable: true, autoPose: 'sit', interact: 'scratch', prompt: 'shred the couch' },
  { id: 'coffeetable', kind: 'coffeetable', label: 'the coffee table', rect: { x: 1040, y: 560, w: 190, h: 45 }, solid: false, walkable: true },
  { id: 'bookshelf', kind: 'bookshelf', label: 'the bookshelf', rect: { x: 780, y: 480, w: 200, h: 55 }, solid: true },
  { id: 'post', kind: 'post', label: 'the scratching post', rect: { x: 1480, y: 950, w: 55, h: 55 }, solid: true, interact: 'scratchgood', prompt: 'scratch (legally)' },
  { id: 'plant', kind: 'plant', label: 'the houseplant', rect: { x: 1500, y: 470, w: 55, h: 70 }, solid: true, interact: 'chomp', prompt: 'chew a leaf' },
  { id: 'rugL', kind: 'rug', label: 'the big rug', rect: { x: 980, y: 800, w: 260, h: 150 }, solid: false },
  { id: 'runner', kind: 'runner', label: 'the runner', rect: { x: 575, y: 300, w: 150, h: 600 }, solid: false },
]

// -------------------------------------------- knockable/toggle objects ---

export interface WorldObject { id: string; x: number; y: number; kind: string }

export const OBJECTS: WorldObject[] = [
  { id: 'vase1', x: 372, y: 262, kind: 'vase' },
  { id: 'cup1', x: 428, y: 292, kind: 'cup' },
  { id: 'cup2', x: 825, y: 102, kind: 'cup' },
  { id: 'frame1', x: 890, y: 102, kind: 'frame' },
  { id: 'books1', x: 862, y: 494, kind: 'books' },
  { id: 'mug1', x: 1128, y: 576, kind: 'mug' },
  { id: 'tp', x: 262, y: 480, kind: 'tp' },
  // toggles (drawn but not knockable)
  { id: 'lamp1', x: 1245, y: 108, kind: 'lamp' },
  { id: 'tv1', x: 1125, y: 507, kind: 'tvscreen' },
]
export const OBJECT_BY_ID = new Map(OBJECTS.map((o) => [o.id, o]))

// ------------------------------------------------------------ collision --

const SOLIDS: Rect[] = [...WALLS, ...FURNITURE.filter((f) => f.solid).map((f) => f.rect)]

export function collide(x: number, y: number): { x: number; y: number } {
  const r = CAT_R
  let nx = Math.min(WORLD.w - 60 - r, Math.max(60 + r, x))
  let ny = Math.min(WORLD.h - 60 - r, Math.max(60 + r, y))
  for (const s of SOLIDS) {
    if (!circleHits(s, nx, ny, r)) continue
    // push out along the smallest penetration axis
    const pushL = nx + r - s.x, pushR = s.x + s.w - (nx - r)
    const pushT = ny + r - s.y, pushB = s.y + s.h - (ny - r)
    const min = Math.min(pushL, pushR, pushT, pushB)
    if (min === pushL) nx = s.x - r
    else if (min === pushR) nx = s.x + s.w + r
    else if (min === pushT) ny = s.y - r
    else ny = s.y + s.h + r
  }
  return { x: nx, y: ny }
}

// --------------------------------------------------------- interaction ---

export interface InteractTarget {
  type: 'furniture' | 'object'
  furniture?: Furniture
  object?: WorldObject
  x: number // where to aim the effect
  y: number
  prompt: string
}

export function nearestInteractable(x: number, y: number): InteractTarget | null {
  let best: InteractTarget | null = null
  let bestD = 90
  for (const o of OBJECTS) {
    if (o.kind === 'lamp' || o.kind === 'tvscreen') continue // toggled via furniture
    const d = Math.hypot(o.x - x, o.y - y)
    if (d < bestD) { bestD = d; best = { type: 'object', object: o, x: o.x, y: o.y, prompt: 'knock it off' } }
  }
  for (const f of FURNITURE) {
    if (!f.interact) continue
    const cx = f.rect.x + f.rect.w / 2, cy = f.rect.y + f.rect.h / 2
    const edge = Math.max(Math.abs(x - cx) - f.rect.w / 2, Math.abs(y - cy) - f.rect.h / 2)
    if (edge < 55 && edge < bestD) {
      bestD = edge
      best = { type: 'furniture', furniture: f, x: cx, y: cy, prompt: f.prompt ?? f.label }
    }
  }
  return best
}

export function furnitureAt(x: number, y: number): Furniture | null {
  for (const f of FURNITURE) if (f.walkable && inRect(f.rect, x, y)) return f
  return null
}
