// Shared third-person camera: a pinhole projection that rides low behind the
// player's cat. World space stays flat top-down x/y (+z up); nothing else in
// the game knows the camera exists.

export const cam = {
  x: 0, y: 0,       // world position
  eyeH: 185,        // eye height above the floor
  yaw: 0,           // world angle the camera looks along
  pitch: 0.5,       // look-down angle, radians
  dist: 215,        // distance behind the cat
  focal: 700,       // px focal length, set from viewport
  cx0: 0,           // screen centre x
  hor: 0,           // projection centre y on screen
}

export const NEAR = 10

export interface CamPt { cx: number; cy: number; cz: number }
export interface ScreenPt { sx: number; sy: number; depth: number }

/** world (x, y, z) -> camera space (right, up, forward), pitch applied. */
export function toCam(x: number, y: number, z = 0): CamPt {
  const dx = x - cam.x, dy = y - cam.y
  const c = Math.cos(cam.yaw), s = Math.sin(cam.yaw)
  const cx = dx * -s + dy * c
  const cy0 = z - cam.eyeH
  const cz0 = dx * c + dy * s
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch)
  return { cx, cy: cy0 * cp + cz0 * sp, cz: -cy0 * sp + cz0 * cp }
}

export function project(x: number, y: number, z = 0): ScreenPt | null {
  const p = toCam(x, y, z)
  if (p.cz < NEAR) return null
  return {
    sx: cam.cx0 + (p.cx / p.cz) * cam.focal,
    sy: cam.hor - (p.cy / p.cz) * cam.focal,
    depth: p.cz,
  }
}

/** Clip a world-space polygon to the near plane, then project it. */
export function projPoly(pts: [number, number, number][]): ScreenPt[] | null {
  const cp = pts.map(([x, y, z]) => toCam(x, y, z))
  const out: CamPt[] = []
  for (let i = 0; i < cp.length; i++) {
    const a = cp[i], b = cp[(i + 1) % cp.length]
    const ain = a.cz >= NEAR, bin = b.cz >= NEAR
    if (ain) out.push(a)
    if (ain !== bin) {
      const t = (NEAR - a.cz) / (b.cz - a.cz)
      out.push({ cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t, cz: NEAR })
    }
  }
  if (out.length < 3) return null
  return out.map((p) => ({
    sx: cam.cx0 + (p.cx / p.cz) * cam.focal,
    sy: cam.hor - (p.cy / p.cz) * cam.focal,
    depth: p.cz,
  }))
}

/** Unproject a screen point onto the z=0 floor plane (for the laser dot). */
export function unproject(sx: number, sy: number): { x: number; y: number } | null {
  // screen point -> ray direction in camera space, then undo the pitch
  const nx = (sx - cam.cx0) / cam.focal
  const ny = (cam.hor - sy) / cam.focal // up component; positive looks up
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch)
  const cy = ny * cp - sp // unpitched: y = y'cos - z'sin
  const cz = ny * sp + cp //            z = y'sin + z'cos
  if (cy >= -0.001) return null // ray doesn't point at the floor
  const t = cam.eyeH / -cy
  const fx = nx * t, fz = cz * t
  const c = Math.cos(cam.yaw), s = Math.sin(cam.yaw)
  return { x: cam.x + fx * -s + fz * c, y: cam.y + fx * c + fz * s }
}
