import type { Furniture, FurnitureMount, FurnitureType } from '../api/types';

// Shared 3D-storage geometry: collision boxes + spawn placement, used by both the
// drag handler (StorageRoom3D) and the "add furniture" placement (StoragePage).

export const WALL_HEIGHT = 2.8; // matches the rendered walls

/** Default footprint per type (must mirror the backend FURNITURE_DEFAULTS). */
export const DEFAULT_SIZE: Record<FurnitureType, { width: number; height: number; depth: number }> = {
  CUBES: { width: 0.77, height: 0.77, depth: 0.39 },
  CUBE: { width: 0.39, height: 0.39, depth: 0.39 },
  TOWER: { width: 0.355, height: 0.971, depth: 0.34 },
  BAC: { width: 0.6, height: 0.35, depth: 0.5 },
  VITRINE: { width: 0.8, height: 1.8, depth: 0.4 },
  CHEVALET: { width: 0.4, height: 0.5, depth: 0.3 },
  SHELF: { width: 1.0, height: 0.3, depth: 0.32 },
  FRAME: { width: 0.35, height: 0.35, depth: 0.04 },
};

const rad = (d: number) => (d * Math.PI) / 180;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Human cell label by furniture role, e.g. "Tour vinyles 1 · bac",
 * "Vitrine · étagère 2", "Kallax · colonne 2 · rangée 1". Rows/shelves are
 * counted from the TOP (1 = highest, the natural reading order), columns
 * left→right; a single-cell piece is just its name. Mirror this in the backend.
 */
export function cellLabel(f: { name: string; type: FurnitureType; columns: number; rows: number }, x: number, y: number): string {
  if (f.type === 'TOWER') {
    const nCub = Math.max(1, f.rows - 1);
    return y >= nCub ? `${f.name} · bac` : `${f.name} · casier ${nCub - y}`;
  }
  if (f.type === 'VITRINE' && f.rows > 1) return `${f.name} · étagère ${f.rows - y}`;
  if (f.type === 'CUBES') {
    const parts: string[] = [];
    if (f.columns > 1) parts.push(`colonne ${x + 1}`);
    if (f.rows > 1) parts.push(`rangée ${f.rows - y}`);
    return parts.length ? `${f.name} · ${parts.join(' · ')}` : f.name;
  }
  // CUBE / BAC / SHELF / CHEVALET / FRAME and single-row vitrines: one cell.
  return f.name;
}

export interface Room {
  width: number;
  depth: number;
}

type BoxInput = Pick<Furniture, 'mount' | 'posX' | 'posY' | 'posZ' | 'rotation' | 'width' | 'height' | 'depth'>;

export interface Box {
  mount: FurnitureMount;
  cx: number;
  cz: number;
  cy: number;
  hx: number;
  hz: number;
  hy: number;
}

/**
 * Axis-aligned collision box in the piece's interaction plane plus its vertical
 * range. Wall pieces collapse the perpendicular axis (so two pieces on the same
 * wall collide on the wall plane only); floor pieces use the rotation-expanded
 * footprint so a turned piece still blocks correctly.
 */
export function boxOf(f: BoxInput): Box {
  if (f.mount === 'WALL_BACK')
    return { mount: f.mount, cx: f.posX, cz: 0, cy: f.posY + f.height / 2, hx: f.width / 2, hz: f.depth / 2, hy: f.height / 2 };
  if (f.mount === 'WALL_LEFT')
    return { mount: f.mount, cx: 0, cz: f.posZ, cy: f.posY + f.height / 2, hx: f.depth / 2, hz: f.width / 2, hy: f.height / 2 };
  const r = rad(f.rotation);
  const hx = (Math.abs(f.width * Math.cos(r)) + Math.abs(f.depth * Math.sin(r))) / 2;
  const hz = (Math.abs(f.width * Math.sin(r)) + Math.abs(f.depth * Math.cos(r))) / 2;
  return { mount: 'FLOOR', cx: f.posX, cz: f.posZ, cy: f.posY + f.height / 2, hx, hz, hy: f.height / 2 };
}

const EPS = 0.002;

/** Movement snaps to this floor grid (metres) — keeps placement clean + simple. */
export const GRID = 0.1;
export const snap = (v: number) => Math.round(v / GRID) * GRID;

/** Do two boxes overlap? Different domains (floor vs a wall) never collide. */
export function overlap(a: Box, b: Box): boolean {
  if (a.mount !== b.mount) return false;
  return (
    Math.abs(a.cx - b.cx) < a.hx + b.hx - EPS &&
    Math.abs(a.cz - b.cz) < a.hz + b.hz - EPS &&
    Math.abs(a.cy - b.cy) < a.hy + b.hy - EPS // vertical: stacked pieces don't collide
  );
}

/**
 * Slide a value from `cur` toward `target` along one axis, stopping flush against
 * the nearest blocker so pieces can touch with no gap. `blockers` are the boxes
 * that overlap on the other two axes, reduced to their centre/half on this axis.
 */
function slide(cur: number, target: number, mHalf: number, blockers: { c: number; h: number }[]): number {
  let t = target;
  if (t > cur) {
    for (const b of blockers) {
      const face = b.c - b.h - mHalf; // contact = zero gap
      if (face >= cur - EPS && face < t) t = face;
    }
  } else if (t < cur) {
    for (const b of blockers) {
      const face = b.c + b.h + mHalf;
      if (face <= cur + EPS && face > t) t = face;
    }
  }
  return t;
}

/**
 * Move a dragged piece to a grid-snapped target, kept inside the room and out of
 * every other piece — sliding flush against neighbours/walls (axis-separated, so
 * it slides along instead of sticking). Returns the mount-relevant fields.
 */
export function resolveDrag(
  moving: Furniture,
  others: Furniture[],
  room: Room,
  target: { x?: number; y?: number; z?: number },
): { posX?: number; posY?: number; posZ?: number } {
  const mb = boxOf(moving);
  const obs = others.map(boxOf).filter((o) => o.mount === mb.mount);
  const W = room.width;
  const D = room.depth;
  const yHit = (o: Box) => Math.abs(mb.cy - o.cy) < mb.hy + o.hy - EPS;

  if (moving.mount === 'WALL_BACK') {
    // axes: X (along wall) and Y (height)
    const tx = clamp(snap(target.x ?? moving.posX), -W / 2 + mb.hx, W / 2 - mb.hx);
    const cyT = clamp(snap(target.y ?? moving.posY) + mb.hy, mb.hy, WALL_HEIGHT - mb.hy);
    const xBlock = obs.filter((o) => Math.abs(mb.cy - o.cy) < mb.hy + o.hy - EPS).map((o) => ({ c: o.cx, h: o.hx }));
    const ax = slide(mb.cx, tx, mb.hx, xBlock);
    const yBlock = obs.filter((o) => Math.abs(ax - o.cx) < mb.hx + o.hx - EPS).map((o) => ({ c: o.cy, h: o.hy }));
    const cy = slide(mb.cy, cyT, mb.hy, yBlock);
    return { posX: ax, posY: cy - mb.hy };
  }
  if (moving.mount === 'WALL_LEFT') {
    const tz = clamp(snap(target.z ?? moving.posZ), -D / 2 + mb.hz, D / 2 - mb.hz);
    const cyT = clamp(snap(target.y ?? moving.posY) + mb.hy, mb.hy, WALL_HEIGHT - mb.hy);
    const zBlock = obs.filter((o) => Math.abs(mb.cy - o.cy) < mb.hy + o.hy - EPS).map((o) => ({ c: o.cz, h: o.hz }));
    const az = slide(mb.cz, tz, mb.hz, zBlock);
    const yBlock = obs.filter((o) => Math.abs(az - o.cz) < mb.hz + o.hz - EPS).map((o) => ({ c: o.cy, h: o.hy }));
    const cy = slide(mb.cy, cyT, mb.hy, yBlock);
    return { posZ: az, posY: cy - mb.hy };
  }
  // FLOOR — axes X and Z, only blockers whose height range overlaps
  const tx = clamp(snap(target.x ?? moving.posX), -W / 2 + mb.hx, W / 2 - mb.hx);
  const tz = clamp(snap(target.z ?? moving.posZ), -D / 2 + mb.hz, D / 2 - mb.hz);
  const xBlock = obs.filter((o) => yHit(o) && Math.abs(mb.cz - o.cz) < mb.hz + o.hz - EPS).map((o) => ({ c: o.cx, h: o.hx }));
  const ax = slide(mb.cx, tx, mb.hx, xBlock);
  const zBlock = obs.filter((o) => yHit(o) && Math.abs(ax - o.cx) < mb.hx + o.hx - EPS).map((o) => ({ c: o.cz, h: o.hz }));
  const az = slide(mb.cz, tz, mb.hz, zBlock);
  return { posX: ax, posZ: az };
}

/** A free floor spot for a new piece, scanning front-to-back, left-to-right. */
export function findSpawnFloor(type: FurnitureType, items: Furniture[], room: Room): { posX: number; posZ: number } {
  const s = DEFAULT_SIZE[type];
  const obs = items.map(boxOf);
  const W = room.width;
  const D = room.depth;
  const probe = boxOf({ mount: 'FLOOR', posX: 0, posY: 0, posZ: 0, rotation: 0, ...s });
  for (let z = -D / 2 + probe.hz + 0.1; z <= D / 2 - probe.hz; z += 0.4) {
    for (let x = -W / 2 + probe.hx + 0.1; x <= W / 2 - probe.hx; x += 0.4) {
      const b: Box = { ...probe, cx: x, cz: z, cy: s.height / 2 };
      if (!obs.some((o) => overlap(b, o))) return { posX: snap(x), posZ: snap(z) };
    }
  }
  return { posX: 0, posZ: 0 };
}

/** A free spot along the back wall (at eye level) for a new wall piece. */
export function findSpawnWallBack(type: FurnitureType, items: Furniture[], room: Room, posY: number): { posX: number } {
  const s = DEFAULT_SIZE[type];
  const obs = items.map(boxOf);
  const W = room.width;
  for (let x = -W / 2 + s.width / 2 + 0.1; x <= W / 2 - s.width / 2; x += 0.4) {
    const b = boxOf({ mount: 'WALL_BACK', posX: x, posY, posZ: 0, rotation: 0, ...s });
    if (!obs.some((o) => overlap(b, o))) return { posX: snap(x) };
  }
  return { posX: 0 };
}
