import { Component, ReactNode, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, ThreeEvent, useThree } from '@react-three/fiber';
import { OrbitControls, Edges, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { Furniture, FurnitureCell } from '../api/types';
import { resolveDrag } from '../lib/furniture';

// Palette tuned to the app's parchment/wood theme.
const FLOOR = '#cbb892';
const WALL = '#e7dcc4';
const WOOD = '#6b4e34';
const WOOD_DARK = '#3f2d1c';
const INTERIOR = '#2c2118';
const SELECT = '#b8451f';
const HOVER = '#d2683f';

const rad = (deg: number) => (deg * Math.PI) / 180;

export interface RoomDims {
  width: number;
  depth: number;
}

export type PosPatch = { posX?: number; posY?: number; posZ?: number };

interface Props {
  furniture: Furniture[];
  room: RoomDims;
  selectedId: string | null;
  onSelectFurniture: (id: string | null) => void;
  onSelectCell: (f: Furniture, x: number, y: number) => void;
  onDragMove: (id: string, pos: PosPatch) => void;
  onDragEnd: (id: string) => void;
}

// ── Cover texture (best-effort; a broken image renders nothing, never crashes) ──
class CoverBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function CoverTex({
  url,
  w,
  h,
  position,
  rotation,
}: {
  url: string;
  w: number;
  h: number;
  position: [number, number, number];
  rotation?: [number, number, number];
}) {
  const tex = useTexture(url) as THREE.Texture;
  tex.colorSpace = THREE.SRGBColorSpace;
  return (
    <mesh position={position} rotation={rotation} raycast={() => null}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={tex} roughness={0.65} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Cover(props: { url: string; w: number; h: number; position: [number, number, number]; rotation?: [number, number, number] }) {
  return (
    <CoverBoundary>
      <Suspense fallback={null}>
        <CoverTex {...props} />
      </Suspense>
    </CoverBoundary>
  );
}

// ── Records filed on a shelf, seen from the spine ──────────────────────────────
const SPINE_PITCH = 0.013; // centre-to-centre spacing (sleeve thickness + gap)
const SPINE_T = 0.01; // spine thickness
// Kraft / cardboard tones for spines beyond the covers we actually shipped.
const KRAFT = ['#9a8463', '#b39b73', '#857051', '#a88f66', '#6f5c40', '#7e6a4a'];

function TexturedSpine({ url, t, h, d, position }: { url: string; t: number; h: number; d: number; position: [number, number, number] }) {
  const tex = useTexture(url) as THREE.Texture;
  tex.colorSpace = THREE.SRGBColorSpace;
  return (
    <mesh position={position} raycast={() => null} castShadow>
      <boxGeometry args={[t, h, d]} />
      <meshStandardMaterial map={tex} roughness={0.7} />
    </mesh>
  );
}

function Spine({ url, color, t, h, d, position }: { url?: string; color: string; t: number; h: number; d: number; position: [number, number, number] }) {
  const neutral = (
    <mesh position={position} raycast={() => null} castShadow>
      <boxGeometry args={[t, h, d]} />
      <meshStandardMaterial color={color} roughness={0.95} />
    </mesh>
  );
  if (!url) return neutral;
  return (
    <CoverBoundary>
      <Suspense fallback={neutral}>
        <TexturedSpine url={url} t={t} h={h} d={d} position={position} />
      </Suspense>
    </CoverBoundary>
  );
}

/** A run of records standing upright, packed left-to-right, shown spine-out. */
function SpineRow({
  covers,
  count,
  width,
  baseY,
  height,
  depth,
  z = 0,
}: {
  covers: string[];
  count: number;
  width: number;
  baseY: number;
  height: number;
  depth: number;
  z?: number;
}) {
  const cap = Math.max(0, Math.floor(width / SPINE_PITCH));
  const n = Math.min(count, cap, 80);
  if (n <= 0) return null;
  const span = (n - 1) * SPINE_PITCH;
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <Spine
          key={i}
          url={covers[i]}
          color={KRAFT[(i * 7) % KRAFT.length]}
          t={SPINE_T}
          h={height}
          d={depth}
          position={[-span / 2 + i * SPINE_PITCH, baseY + height / 2, z]}
        />
      ))}
    </>
  );
}

/** Records leaning back, face-out, flip-through (a record bin). x is local 0. */
function BinCovers({ covers, baseY, sleeve, depth }: { covers: string[]; baseY: number; sleeve: number; depth: number }) {
  const n = Math.min(covers.length, 8);
  if (n <= 0) return null;
  return (
    <>
      {covers.slice(0, n).map((url, k) => {
        const z = depth / 2 - 0.04 - (k / Math.max(n, 1)) * (depth * 0.62);
        return <Cover key={k} url={url} w={sleeve} h={sleeve} position={[0, baseY + sleeve / 2 + 0.01, z]} rotation={[rad(-18), 0, 0]} />;
      })}
    </>
  );
}

// A thin wood panel.
function Panel({ position, size, color = WOOD }: { position: [number, number, number]; size: [number, number, number]; color?: string }) {
  return (
    <mesh position={position} castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}

// ── Geometry helpers ──────────────────────────────────────────────────────────
interface CellBox {
  x: number;
  y: number;
  px: number; // local centre x
  py: number; // local centre y (0 = floor of the piece, up to height)
  cw: number;
  ch: number;
}

function cellLayout(f: Furniture): CellBox[] {
  const usableW = f.width * 0.92;
  const usableH = f.height * 0.92;
  const mx = (f.width - usableW) / 2;
  const my = (f.height - usableH) / 2;
  const cw = usableW / f.columns;
  const ch = usableH / f.rows;
  const out: CellBox[] = [];
  for (let y = 0; y < f.rows; y++) {
    for (let x = 0; x < f.columns; x++) {
      out.push({ x, y, px: -f.width / 2 + mx + cw * (x + 0.5), py: my + ch * (y + 0.5), cw, ch });
    }
  }
  return out;
}

interface PieceProps {
  f: Furniture;
  pos: [number, number, number];
  rotY: number;
  selected: boolean;
  hoverCell: string | null;
  onBodyDown: (f: Furniture, e: ThreeEvent<PointerEvent>, cell: { x: number; y: number } | null) => void;
  onHoverCell: (key: string | null) => void;
}

function FurniturePiece({ f, pos, rotY, selected, hoverCell, onBodyDown, onHoverCell }: PieceProps) {
  const cells = useMemo(() => cellLayout(f), [f.width, f.height, f.columns, f.rows]);
  const cellFor = (x: number, y: number): FurnitureCell | undefined =>
    f.cells.find((c) => c.cellX === x && c.cellY === y);
  const frontZ = f.depth / 2;

  // A transparent click/hover target over one cell's front face.
  const Target = ({ x, y, px, py, w, h, z = frontZ + 0.01 }: { x: number; y: number; px: number; py: number; w: number; h: number; z?: number }) => {
    const key = `${f.id}:${x}:${y}`;
    return (
      <mesh
        position={[px, py, z]}
        onPointerDown={(e) => onBodyDown(f, e, { x, y })}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverCell(key);
        }}
        onPointerOut={() => onHoverCell(null)}
      >
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color={HOVER} transparent opacity={hoverCell === key ? 0.28 : 0} depthWrite={false} />
      </mesh>
    );
  };

  // Body grab handle (drag the whole piece) — used by carcass panels.
  const bodyDown = (e: ThreeEvent<PointerEvent>) => onBodyDown(f, e, null);

  const content = (() => {
    switch (f.type) {
      // ── Vinyl tower: closed cubbies (spine-out) + an open record bin on top ──
      case 'TOWER': {
        const t = 0.022;
        const col = f.color || WOOD;
        const w = f.width;
        const d = f.depth;
        const nCub = Math.max(1, f.rows - 1); // bottom cubbies; the top row is the bin
        const binH = f.height / f.rows;
        const bottomH = f.height - binH;
        const cubbyH = bottomH / nCub;
        const binCell = cellFor(0, f.rows - 1);
        const lipH = binH * 0.45;
        return (
          <group onPointerDown={bodyDown}>
            {/* outer shell (back + full-height sides + bottom) */}
            <Panel position={[0, f.height / 2, -d / 2 + t / 2]} size={[w, f.height, t]} color={col} />
            <Panel position={[-w / 2 + t / 2, f.height / 2, 0]} size={[t, f.height, d]} color={col} />
            <Panel position={[w / 2 - t / 2, f.height / 2, 0]} size={[t, f.height, d]} color={col} />
            <Panel position={[0, t / 2, 0]} size={[w, t, d]} color={col} />
            {/* shelves between cubbies and under the bin */}
            {Array.from({ length: nCub }, (_, i) => (
              <Panel key={`sh${i}`} position={[0, cubbyH * (i + 1), 0]} size={[w, t, d]} color={col} />
            ))}
            {/* closed cubbies, records spine-out */}
            {Array.from({ length: nCub }, (_, y) => {
              const cy0 = cubbyH * y;
              const cyc = cy0 + cubbyH / 2;
              const cell = cellFor(0, y);
              return (
                <group key={`cb${y}`}>
                  <mesh position={[0, cyc, -d / 2 + t + 0.005]} raycast={() => null}>
                    <planeGeometry args={[w - 2 * t, cubbyH - t]} />
                    <meshStandardMaterial color={INTERIOR} roughness={1} />
                  </mesh>
                  <SpineRow
                    covers={cell?.covers ?? []}
                    count={cell?.releaseCount ?? 0}
                    width={w * 0.86}
                    baseY={cy0 + t}
                    height={Math.min(cubbyH * 0.82, w * 0.92)}
                    depth={d * 0.8}
                  />
                  <Target x={0} y={y} px={0} py={cyc} w={w} h={cubbyH} />
                </group>
              );
            })}
            {/* open bin on top: low front lip, open top, records leaning face-out */}
            <Panel position={[0, bottomH + lipH / 2, d / 2 - t / 2]} size={[w, lipH, t]} color={col} />
            <BinCovers covers={binCell?.covers ?? []} baseY={bottomH + t} sleeve={Math.min(w, d) * 0.82} depth={d} />
            <Target x={0} y={f.rows - 1} px={0} py={bottomH + binH / 2} w={w} h={binH} z={d / 2 + 0.02} />
          </group>
        );
      }

      // ── Open cubbies: Kallax (CUBES) and single cube (CUBE) ─────────────────
      case 'CUBE':
      case 'CUBES': {
        const t = 0.024;
        const usableW = f.width * 0.92;
        const usableH = f.height * 0.92;
        const mx = (f.width - usableW) / 2;
        const my = (f.height - usableH) / 2;
        const cw = usableW / f.columns;
        const ch = usableH / f.rows;
        return (
          <group onPointerDown={bodyDown}>
            {/* carcass */}
            <Panel position={[0, f.height / 2, -f.depth / 2 + t / 2]} size={[f.width, f.height, t]} color={f.color || WOOD} />
            <Panel position={[0, t / 2, 0]} size={[f.width, t, f.depth]} color={f.color || WOOD} />
            <Panel position={[0, f.height - t / 2, 0]} size={[f.width, t, f.depth]} color={f.color || WOOD} />
            <Panel position={[-f.width / 2 + t / 2, f.height / 2, 0]} size={[t, f.height, f.depth]} color={f.color || WOOD} />
            <Panel position={[f.width / 2 - t / 2, f.height / 2, 0]} size={[t, f.height, f.depth]} color={f.color || WOOD} />
            {Array.from({ length: f.columns - 1 }, (_, i) => (
              <Panel key={`v${i}`} position={[-f.width / 2 + mx + cw * (i + 1), f.height / 2, 0]} size={[t, f.height, f.depth]} color={f.color || WOOD} />
            ))}
            {Array.from({ length: f.rows - 1 }, (_, j) => (
              <Panel key={`h${j}`} position={[0, my + ch * (j + 1), 0]} size={[f.width, t, f.depth]} color={f.color || WOOD} />
            ))}
            {/* interior + records filed upright (spine-out) per cubby */}
            {cells.map((c) => {
              const cell = cellFor(c.x, c.y);
              return (
                <group key={`c${c.x}-${c.y}`}>
                  <mesh position={[c.px, c.py, -f.depth / 2 + t + 0.005]} raycast={() => null}>
                    <planeGeometry args={[c.cw - t, c.ch - t]} />
                    <meshStandardMaterial color={INTERIOR} roughness={1} />
                  </mesh>
                  <group position={[c.px, 0, 0]}>
                    <SpineRow
                      covers={cell?.covers ?? []}
                      count={cell?.releaseCount ?? 0}
                      width={c.cw * 0.9}
                      baseY={c.py - c.ch / 2 + 0.02}
                      height={Math.min(c.ch * 0.82, c.cw * 0.92)}
                      depth={f.depth * 0.78}
                    />
                  </group>
                  <Target x={c.x} y={c.y} px={c.px} py={c.py} w={c.cw} h={c.ch} />
                </group>
              );
            })}
          </group>
        );
      }

      // ── Record bin (bac à disques) ──────────────────────────────────────────
      case 'BAC': {
        const t = 0.02;
        const cell = cellFor(0, 0);
        const n = Math.min(cell?.covers.length ?? 0, 8);
        const sleeve = Math.min(f.width, f.depth) * 0.82;
        return (
          <group onPointerDown={bodyDown}>
            {/* legs */}
            {[-1, 1].map((sx) =>
              [-1, 1].map((sz) => (
                <Panel key={`l${sx}${sz}`} position={[sx * (f.width / 2 - 0.04), -0.06, sz * (f.depth / 2 - 0.04)]} size={[0.05, 0.12, 0.05]} color={WOOD_DARK} />
              )),
            )}
            {/* bin body: bottom, back (high), front (low), sides */}
            <Panel position={[0, t / 2, 0]} size={[f.width, t, f.depth]} color={f.color || WOOD} />
            <Panel position={[0, f.height * 0.55, -f.depth / 2 + t / 2]} size={[f.width, f.height * 1.1, t]} color={f.color || WOOD} />
            <Panel position={[0, f.height * 0.28, f.depth / 2 - t / 2]} size={[f.width, f.height * 0.56, t]} color={f.color || WOOD} />
            <Panel position={[-f.width / 2 + t / 2, f.height * 0.45, 0]} size={[t, f.height * 0.9, f.depth]} color={f.color || WOOD} />
            <Panel position={[f.width / 2 - t / 2, f.height * 0.45, 0]} size={[t, f.height * 0.9, f.depth]} color={f.color || WOOD} />
            {/* sleeves leaning back inside, front-most first */}
            {cell?.covers.slice(0, n).map((url, k) => {
              const z = f.depth / 2 - 0.06 - (k / Math.max(n, 1)) * (f.depth * 0.7);
              return <Cover key={k} url={url} w={sleeve} h={sleeve} position={[0, sleeve / 2 + t + 0.01, z]} rotation={[rad(-18), 0, 0]} />;
            })}
            {/* click target over the bin opening */}
            <Target x={0} y={0} px={0} py={f.height * 0.6} w={f.width} h={f.height} z={frontZ + 0.02} />
          </group>
        );
      }

      // ── Glass cabinet with shelves ──────────────────────────────────────────
      case 'VITRINE': {
        const t = 0.025;
        const usableH = f.height * 0.94;
        const my = (f.height - usableH) / 2;
        const ch = usableH / f.rows;
        return (
          <group onPointerDown={bodyDown}>
            <Panel position={[0, f.height / 2, -f.depth / 2 + t / 2]} size={[f.width, f.height, t]} color={f.color || WOOD} />
            <Panel position={[0, t / 2, 0]} size={[f.width, t, f.depth]} color={f.color || WOOD} />
            <Panel position={[0, f.height - t / 2, 0]} size={[f.width, t, f.depth]} color={f.color || WOOD} />
            <Panel position={[-f.width / 2 + t / 2, f.height / 2, 0]} size={[t, f.height, f.depth]} color={f.color || WOOD} />
            <Panel position={[f.width / 2 - t / 2, f.height / 2, 0]} size={[t, f.height, f.depth]} color={f.color || WOOD} />
            {/* shelves + records standing spine-out */}
            {Array.from({ length: f.rows }, (_, y) => {
              const shelfY = my + ch * y;
              const cell = cellFor(0, y);
              return (
                <group key={`s${y}`}>
                  <Panel position={[0, shelfY + 0.01, 0]} size={[f.width - t, 0.02, f.depth * 0.92]} color={f.color || WOOD} />
                  <SpineRow
                    covers={cell?.covers ?? []}
                    count={cell?.releaseCount ?? 0}
                    width={f.width * 0.9}
                    baseY={shelfY + 0.02}
                    height={Math.min(ch * 0.82, f.depth * 0.92)}
                    depth={f.depth * 0.82}
                  />
                  <Target x={0} y={y} px={0} py={shelfY + ch / 2} w={f.width * 0.9} h={ch} />
                </group>
              );
            })}
            {/* glass front (non-pickable) */}
            <mesh position={[0, f.height / 2, f.depth / 2 - 0.005]} raycast={() => null}>
              <planeGeometry args={[f.width * 0.94, f.height * 0.94]} />
              <meshStandardMaterial color="#cfe2e4" transparent opacity={0.14} roughness={0.05} metalness={0.3} />
            </mesh>
          </group>
        );
      }

      // ── Easel showing one record face-out ───────────────────────────────────
      case 'CHEVALET': {
        const cell = cellFor(0, 0);
        const s = Math.min(f.width, f.height) * 0.92;
        return (
          <group onPointerDown={bodyDown}>
            {[-f.width / 3, f.width / 3].map((x) => (
              <Panel key={x} position={[x, f.height * 0.45, -0.02]} size={[0.03, f.height * 0.95, 0.03]} color={WOOD_DARK} />
            ))}
            <Panel position={[0, f.height * 0.2, 0.12]} size={[0.03, f.height * 0.5, 0.03]} color={WOOD_DARK} />
            {/* ledge */}
            <Panel position={[0, f.height * 0.45, 0.05]} size={[f.width, 0.03, 0.08]} color={WOOD} />
            <group position={[0, f.height * 0.45 + s / 2, 0.06]} rotation={[rad(-12), 0, 0]}>
              {cell?.covers[0] ? (
                <Cover url={cell.covers[0]} w={s} h={s} position={[0, 0, 0.01]} />
              ) : (
                <mesh raycast={() => null}>
                  <planeGeometry args={[s, s]} />
                  <meshStandardMaterial color={INTERIOR} />
                </mesh>
              )}
              <mesh
                onPointerDown={(e) => onBodyDown(f, e, { x: 0, y: 0 })}
                onPointerOver={(e) => {
                  e.stopPropagation();
                  onHoverCell(`${f.id}:0:0`);
                }}
                onPointerOut={() => onHoverCell(null)}
              >
                <planeGeometry args={[s, s]} />
                <meshStandardMaterial color={HOVER} transparent opacity={hoverCell === `${f.id}:0:0` ? 0.28 : 0} depthWrite={false} />
              </mesh>
            </group>
          </group>
        );
      }

      // ── Wall frame around one record cover ──────────────────────────────────
      case 'FRAME': {
        const cell = cellFor(0, 0);
        const b = Math.min(f.width, f.height) * 0.08; // border
        const inner = Math.min(f.width, f.height) - 2 * b;
        return (
          <group onPointerDown={bodyDown}>
            {/* frame border */}
            <Panel position={[0, f.height - b / 2, f.depth / 2]} size={[f.width, b, f.depth]} color={f.color || WOOD_DARK} />
            <Panel position={[0, b / 2, f.depth / 2]} size={[f.width, b, f.depth]} color={f.color || WOOD_DARK} />
            <Panel position={[-f.width / 2 + b / 2, f.height / 2, f.depth / 2]} size={[b, f.height, f.depth]} color={f.color || WOOD_DARK} />
            <Panel position={[f.width / 2 - b / 2, f.height / 2, f.depth / 2]} size={[b, f.height, f.depth]} color={f.color || WOOD_DARK} />
            {cell?.covers[0] ? (
              <Cover url={cell.covers[0]} w={inner} h={inner} position={[0, f.height / 2, f.depth / 2 + 0.002]} />
            ) : (
              <mesh position={[0, f.height / 2, f.depth / 2]} raycast={() => null}>
                <planeGeometry args={[inner, inner]} />
                <meshStandardMaterial color={INTERIOR} />
              </mesh>
            )}
            <Target x={0} y={0} px={0} py={f.height / 2} w={inner} h={inner} z={f.depth / 2 + 0.01} />
          </group>
        );
      }

      // ── Open shelf with records standing face-out ───────────────────────────
      case 'SHELF':
      default: {
        const t = 0.03;
        const cell = cellFor(0, 0);
        return (
          <group onPointerDown={bodyDown}>
            <Panel position={[0, t / 2, 0]} size={[f.width, t, f.depth]} color={f.color || WOOD} />
            <Panel position={[0, f.height / 2, -f.depth / 2 + t / 2]} size={[f.width, f.height, t]} color={f.color || WOOD} />
            <SpineRow
              covers={cell?.covers ?? []}
              count={cell?.releaseCount ?? 0}
              width={f.width * 0.92}
              baseY={t}
              height={Math.min(f.height * 0.9, f.depth * 0.92)}
              depth={f.depth * 0.82}
            />
            <Target x={0} y={0} px={0} py={f.height / 2} w={f.width * 0.92} h={f.height} z={frontZ + 0.05} />
          </group>
        );
      }
    }
  })();

  return (
    <group position={pos} rotation={[0, rotY, 0]}>
      {content}
      {selected && (
        <mesh position={[0, f.height / 2, 0]} raycast={() => null}>
          <boxGeometry args={[f.width * 1.04, f.height * 1.04, f.depth * 1.04]} />
          <meshBasicMaterial visible={false} />
          <Edges color={SELECT} />
        </mesh>
      )}
    </group>
  );
}

// Resolve a piece's group placement from its mount (applied in Scene so drag math
// and rendering agree).
function placement(f: Furniture, room: RoomDims): { pos: [number, number, number]; rotY: number } {
  if (f.mount === 'WALL_BACK') return { pos: [f.posX, f.posY, -room.depth / 2 + f.depth / 2 + 0.001], rotY: 0 };
  if (f.mount === 'WALL_LEFT') return { pos: [-room.width / 2 + f.depth / 2 + 0.001, f.posY, f.posZ], rotY: rad(90) };
  return { pos: [f.posX, f.posY, f.posZ], rotY: rad(f.rotation) };
}

function Scene({ furniture, room, selectedId, onSelectFurniture, onSelectCell, onDragMove, onDragEnd }: Props) {
  const { camera, gl } = useThree();
  const controls = useRef<any>(null);
  const drag = useRef<
    | {
        id: string;
        mount: Furniture['mount'];
        plane: THREE.Plane;
        off: THREE.Vector3;
        sx: number;
        sy: number;
        moved: boolean;
        cell: { x: number; y: number } | null;
      }
    | null
  >(null);
  const [hoverCell, setHoverCell] = useState<string | null>(null);

  const rayTo = (ev: PointerEvent, plane: THREE.Plane): THREE.Vector3 | null => {
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, hit) ? hit : null;
  };

  // Drag plane per mount: floor pieces slide on y=0; wall pieces slide on their wall.
  const planeFor = (f: Furniture): THREE.Plane => {
    if (f.mount === 'WALL_BACK') return new THREE.Plane(new THREE.Vector3(0, 0, 1), room.depth / 2);
    if (f.mount === 'WALL_LEFT') return new THREE.Plane(new THREE.Vector3(1, 0, 0), room.width / 2);
    return new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  };

  const onBodyDown = (f: Furniture, e: ThreeEvent<PointerEvent>, cell: { x: number; y: number } | null) => {
    e.stopPropagation();
    onSelectFurniture(f.id);
    const plane = planeFor(f);
    const pt = rayTo(e.nativeEvent as PointerEvent, plane);
    const place = placement(f, room);
    const origin = new THREE.Vector3(...place.pos);
    drag.current = {
      id: f.id,
      mount: f.mount,
      plane,
      off: pt ? pt.clone().sub(origin) : new THREE.Vector3(),
      sx: (e.nativeEvent as PointerEvent).clientX,
      sy: (e.nativeEvent as PointerEvent).clientY,
      moved: false,
      cell,
    };
    if (controls.current) controls.current.enabled = false;
  };

  useEffect(() => {
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.moved && Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) > 5) d.moved = true;
      if (!d.moved) return;
      const pt = rayTo(ev, d.plane);
      if (!pt) return;
      const p = pt.sub(d.off);
      const moving = furniture.find((x) => x.id === d.id);
      if (!moving) return;
      const others = furniture.filter((x) => x.id !== d.id);
      const target =
        d.mount === 'WALL_BACK'
          ? { x: p.x, y: p.y }
          : d.mount === 'WALL_LEFT'
            ? { z: p.z, y: p.y }
            : { x: p.x, z: p.z };
      onDragMove(d.id, resolveDrag(moving, others, room, target));
    };
    const up = () => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      if (controls.current) controls.current.enabled = true;
      if (d.moved) onDragEnd(d.id);
      else if (d.cell) {
        const f = furniture.find((x) => x.id === d.id);
        if (f) onSelectCell(f, d.cell.x, d.cell.y);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.width, room.depth, furniture, onDragMove, onDragEnd, onSelectCell]);

  useEffect(() => {
    document.body.style.cursor = hoverCell ? 'pointer' : 'auto';
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, [hoverCell]);

  const maxSpan = Math.max(room.width, room.depth);

  // Apply mount placement to each piece before rendering.
  const placed = furniture.map((f) => ({ f, ...placement(f, room) }));

  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight position={[maxSpan * 0.6, maxSpan, maxSpan * 0.4]} intensity={0.8} castShadow />
      <directionalLight position={[-maxSpan * 0.5, maxSpan * 0.7, -maxSpan * 0.3]} intensity={0.3} />
      <OrbitControls ref={controls} makeDefault enableDamping target={[0, 0.6, 0]} maxPolarAngle={Math.PI / 2.02} minDistance={1} maxDistance={maxSpan * 3} />

      <mesh
        rotation-x={-Math.PI / 2}
        receiveShadow
        onPointerDown={(e) => {
          if ((e.nativeEvent as PointerEvent).button === 0 && !drag.current) onSelectFurniture(null);
        }}
      >
        <planeGeometry args={[room.width, room.depth]} />
        <meshStandardMaterial color={FLOOR} roughness={1} />
      </mesh>
      <gridHelper args={[maxSpan, Math.round(maxSpan), '#a8946f', '#bfae89']} position-y={0.002} />

      <mesh position={[0, 1.4, -room.depth / 2]} receiveShadow>
        <boxGeometry args={[room.width, 2.8, 0.06]} />
        <meshStandardMaterial color={WALL} roughness={1} />
      </mesh>
      <mesh position={[-room.width / 2, 1.4, 0]} receiveShadow>
        <boxGeometry args={[0.06, 2.8, room.depth]} />
        <meshStandardMaterial color={WALL} roughness={1} />
      </mesh>

      {placed.map(({ f, pos, rotY }) => (
        <FurniturePiece
          key={f.id}
          f={f}
          pos={pos}
          rotY={rotY}
          selected={f.id === selectedId}
          hoverCell={hoverCell}
          onBodyDown={onBodyDown}
          onHoverCell={setHoverCell}
        />
      ))}
    </>
  );
}

export default function StorageRoom3D(props: Props) {
  const span = Math.max(props.room.width, props.room.depth);
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [props.room.width * 0.45, span * 0.7, props.room.depth * 0.95], fov: 50 }}
      style={{ background: 'linear-gradient(#efe6d2, #d8c9ac)' }}
    >
      <Scene {...props} />
    </Canvas>
  );
}
