import { useEffect, useRef } from 'react';
import { Origin } from '../api/types';

const DEG = Math.PI / 180;
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

type Ring = [number, number][]; // [lng, lat]
type Poly = Ring[];
interface Vec {
  x: number;
  y: number;
  z: number;
}

// Module-level cache so the land geometry is fetched only once.
let landCache: Poly[] | null = null;

interface Props {
  origins: Origin[];
  onSelect: (name: string) => void;
}

export function Globe({ origins, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landRef = useRef<Poly[] | null>(landCache);
  const rot = useRef({ lng: -30, lat: 18 });
  const zoom = useRef(1);
  const spin = useRef(true);
  const hover = useRef<string | null>(null);

  // Multi-pointer state (1 finger = rotate, 2 fingers = pinch-zoom).
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const last = useRef<{ x: number; y: number } | null>(null);
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const down = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  useEffect(() => {
    if (landCache) return;
    fetch('/world-110m.json')
      .then((r) => r.json())
      .then((data: Poly[]) => {
        landCache = data;
        landRef.current = data;
      })
      .catch(() => undefined);
  }, []);

  // Rotated unit-sphere coordinates; z > 0 is the visible (near) hemisphere.
  const rotated = (lat: number, lng: number): Vec => {
    const phi = lat * DEG;
    const lambda = (lng + rot.current.lng) * DEG;
    const phi0 = rot.current.lat * DEG;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    const cosL = Math.cos(lambda);
    return {
      x: cosPhi * Math.sin(lambda),
      y: Math.cos(phi0) * sinPhi - Math.sin(phi0) * cosPhi * cosL,
      z: Math.sin(phi0) * sinPhi + Math.cos(phi0) * cosPhi * cosL,
    };
  };

  // ── Render loop (imperative canvas) ───────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let lastT = performance.now();

    const draw = (now: number) => {
      const dt = now - lastT;
      lastT = now;
      if (spin.current && pointers.current.size === 0) rot.current.lng += dt * 0.004;

      const dpr = window.devicePixelRatio || 1;
      const size = canvas.clientWidth;
      if (canvas.width !== size * dpr) {
        canvas.width = size * dpr;
        canvas.height = size * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      const cx = size / 2;
      const cy = size / 2;
      const R = (size / 2 - 14) * zoom.current;
      const sx = (v: Vec) => cx + R * v.x;
      const sy = (v: Vec) => cy - R * v.y;

      // Clip everything to the on-screen square so a zoomed globe doesn't bleed.
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, size, size);
      ctx.clip();

      // Ocean
      const ocean = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
      ocean.addColorStop(0, '#2c4a55');
      ocean.addColorStop(0.6, '#1b2e36');
      ocean.addColorStop(1, '#0c1417');
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = ocean;
      ctx.fill();

      // Land — Sutherland-Hodgman clip each ring against the z>=0 half-space.
      const land = landRef.current;
      if (land) {
        ctx.fillStyle = '#6b7f5a';
        ctx.strokeStyle = 'rgba(250,245,234,0.18)';
        ctx.lineWidth = 0.4;
        for (const poly of land) {
          for (const ring of poly) {
            const pts = ring.map((p) => rotated(p[1], p[0]));
            const clipped: Vec[] = [];
            const n = pts.length;
            for (let i = 0; i < n; i++) {
              const A = pts[i];
              const B = pts[(i + 1) % n];
              const Ain = A.z >= 0;
              const Bin = B.z >= 0;
              if (Ain) clipped.push(A);
              if (Ain !== Bin) {
                const t = A.z / (A.z - B.z);
                clipped.push({
                  x: A.x + t * (B.x - A.x),
                  y: A.y + t * (B.y - A.y),
                  z: 0,
                });
              }
            }
            if (clipped.length < 3) continue;
            ctx.beginPath();
            ctx.moveTo(sx(clipped[0]), sy(clipped[0]));
            for (let i = 1; i < clipped.length; i++) ctx.lineTo(sx(clipped[i]), sy(clipped[i]));
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
        }
      }

      // Graticule
      ctx.strokeStyle = 'rgba(250,245,234,0.07)';
      ctx.lineWidth = 0.5;
      for (let lng = -180; lng < 180; lng += 30) {
        ctx.beginPath();
        let started = false;
        for (let lat = -90; lat <= 90; lat += 4) {
          const v = rotated(lat, lng);
          if (v.z >= 0) {
            if (!started) (ctx.moveTo(sx(v), sy(v)), (started = true));
            else ctx.lineTo(sx(v), sy(v));
          } else started = false;
        }
        ctx.stroke();
      }

      // Origin points
      const maxCount = origins.reduce((m, o) => Math.max(m, o.count), 1);
      for (const o of origins) {
        const v = rotated(o.lat, o.lng);
        if (v.z < 0) continue;
        const r = (3 + (o.count / maxCount) * 11) * Math.min(1.6, zoom.current);
        const active = hover.current === o.code;
        ctx.beginPath();
        ctx.arc(sx(v), sy(v), r + 4, 0, Math.PI * 2);
        ctx.fillStyle = active ? 'rgba(184,69,31,0.4)' : 'rgba(184,69,31,0.2)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sx(v), sy(v), r, 0, Math.PI * 2);
        ctx.fillStyle = active ? '#d2683f' : '#b8451f';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(250,245,234,0.7)';
        ctx.stroke();
      }

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [origins]);

  // Non-passive wheel listener so we can prevent page scroll while zooming.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const next = zoom.current * (1 - e.deltaY * 0.0015);
      zoom.current = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // ── Hit-testing (points) ──────────────────────────────────────────────
  const hit = (clientX: number, clientY: number): Origin | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const size = rect.width;
    const cx = size / 2;
    const cy = size / 2;
    const R = (size / 2 - 14) * zoom.current;
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const maxCount = origins.reduce((m, o) => Math.max(m, o.count), 1);
    for (const o of origins) {
      const v = rotated(o.lat, o.lng);
      if (v.z < 0) continue;
      const x = cx + R * v.x;
      const y = cy - R * v.y;
      const r = (3 + (o.count / maxCount) * 11) * Math.min(1.6, zoom.current) + 5;
      if ((mx - x) ** 2 + (my - y) ** 2 <= r * r) return o;
    }
    return null;
  };

  const dist2 = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    down.current = { x: e.clientX, y: e.clientY, moved: false };
    if (pointers.current.size === 1) last.current = { x: e.clientX, y: e.clientY };
    else if (pointers.current.size === 2) {
      pinch.current = { dist: dist2(), zoom: zoom.current };
      last.current = null;
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) {
      const o = hit(e.clientX, e.clientY);
      hover.current = o?.code ?? null;
      if (canvasRef.current) canvasRef.current.style.cursor = o ? 'pointer' : 'grab';
      return;
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (down.current) down.current.moved = true;

    if (pointers.current.size >= 2 && pinch.current) {
      const factor = dist2() / pinch.current.dist;
      zoom.current = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinch.current.zoom * factor));
    } else if (last.current) {
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      rot.current.lng += (dx * 0.4) / zoom.current;
      rot.current.lat = Math.max(-85, Math.min(85, rot.current.lat + (dy * 0.4) / zoom.current));
      last.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 1) {
      const remaining = [...pointers.current.values()][0];
      last.current = { ...remaining };
    } else if (pointers.current.size === 0) {
      last.current = null;
      // Treat a tap (no drag) as a selection.
      if (down.current && !down.current.moved) {
        const o = hit(e.clientX, e.clientY);
        if (o) onSelect(o.name);
      }
    }
    down.current = null;
  };

  const bumpZoom = (mult: number) => {
    zoom.current = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom.current * mult));
  };

  return (
    <div className="relative mx-auto w-full max-w-[min(82vh,820px)] select-none">
      <canvas
        ref={canvasRef}
        className="aspect-square w-full cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
      <div className="absolute bottom-2 right-2 flex items-center gap-1">
        <button
          onClick={() => bumpZoom(1 / 1.3)}
          className="h-7 w-7 rounded-full bg-ink/70 text-cream hover:bg-ink"
          title="Dézoomer"
        >
          −
        </button>
        <button
          onClick={() => bumpZoom(1.3)}
          className="h-7 w-7 rounded-full bg-ink/70 text-cream hover:bg-ink"
          title="Zoomer"
        >
          +
        </button>
        <button
          onClick={() => (spin.current = !spin.current)}
          className="rounded-full bg-ink/70 px-3 py-1 text-xs text-cream hover:bg-ink"
          title="Rotation auto"
        >
          ⟳
        </button>
      </div>
    </div>
  );
}
