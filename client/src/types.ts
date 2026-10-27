// Wire protocol + shared types. server/server.js must agree with these.

export type Pattern = 'none' | 'tabby' | 'spots' | 'tuxedo'
export type Accessory = 'none' | 'hat' | 'bowtie' | 'glasses'
export type Facing = 'up' | 'down' | 'left' | 'right'
export type Pose = 'stand' | 'walk' | 'sit' | 'sleep' | 'eat'

export interface CatCustom {
  color: string
  pattern: Pattern
  accessory: Accessory
}

export interface Player {
  id: string
  name: string
  cat: CatCustom
  x: number
  y: number
  facing: Facing
  pose: Pose
}

// -- client -> server ----------------------------------------------------

export type ClientMsg =
  | { t: 'join'; room: string; name: string; cat: CatCustom; x: number; y: number }
  | { t: 'pos'; x: number; y: number; facing: Facing; pose: Pose }
  | { t: 'chat'; text: string }
  | { t: 'emote'; kind: string; target?: string }
  | { t: 'act'; id: string; kind: 'knock' | 'toggle' }
  | { t: 'dmg'; kind: 'couch'; x: number; y: number }
  | { t: 'laser'; on: boolean; x: number; y: number }
  | { t: 'pounce'; x: number; y: number }
  | { t: 'nip'; x: number; y: number }

// -- server -> client ----------------------------------------------------

export type ServerMsg =
  | { t: 'welcome'; id: string; room: string; players: Player[]; objects: Record<string, string>; toggles: Record<string, boolean>; damage: { couch: number }; chaos?: number; mouse?: { x: number; y: number } | null; catnip?: { x: number; y: number } | null }
  | { t: 'join'; player: Player }
  | { t: 'leave'; id: string }
  | { t: 'pos'; id: string; x: number; y: number; facing: Facing; pose: Pose }
  | { t: 'chat'; id: string; text: string }
  | { t: 'emote'; id: string; kind: string; target: string }
  | { t: 'obj'; id: string; state: string } // 'ok' | 'broken' | 'on' | 'off'
  | { t: 'dmg'; kind: 'couch'; count: number; x: number; y: number }
  | { t: 'laser'; id: string; on: boolean; x: number; y: number }
  | { t: 'mouse'; x: number; y: number }
  | { t: 'mousegone' }
  | { t: 'nip'; x: number; y: number }
  | { t: 'nipgone'; x: number; y: number; who: string }
  | { t: 'squeak'; x: number; y: number }
  | { t: 'chaos'; v: number }
  | { t: 'err'; msg: string }
