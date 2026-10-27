// Isometric projection. The game world stays a flat top-down map (collision,
// layout and netcode are all plain x/y) — only rendering projects it into a
// dimetric view. Characters remain upright billboards on the floor plane.

export const ISO_COS = Math.cos(Math.PI / 6) // ~0.866

export interface ScreenPt { sx: number; sy: number }

/** world (x, y, z) -> screen. z is height above the floor. */
export function iso(x: number, y: number, z = 0): ScreenPt {
  return { sx: (x - y) * ISO_COS, sy: (x + y) * 0.5 - z }
}

/** inverse: screen -> world floor coords (z = 0) */
export function unIso(sx: number, sy: number): { x: number; y: number } {
  return { x: sy + sx / (2 * ISO_COS), y: sy - sx / (2 * ISO_COS) }
}
