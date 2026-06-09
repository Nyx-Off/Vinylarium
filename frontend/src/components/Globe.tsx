import { useEffect, useRef, useState } from 'react';
import { Origin } from '../api/types';

const DEG = Math.PI / 180;

type Ring = [number, number][]; // [lng, lat]
type Poly = Ring[];

// Module-level cache so the land geometry is fetched only once.
let landCache: Poly[] | null = null;

interface Props {
  origins: Origin[];
  onSelect: (name: string) => void;
}

export function Globe({ origins, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [land, setLand] = useState<Poly[] | null>(landCache);
  const rot = useRef({ lng: -30, lat: 18 });
  const spin = useRef(true);
  const hover = useRef<string | null>(null);
  const drag = useRef<{ x: number; y: number; lng: number; lat: number } | null>(null);
  const [spinUi, setSpinUi] = useState(true);

  useEffect(() => {
    if (landCache) return;
    fetch('/world-110m.json')
      .then((r) => r.json())
      .then((data: Poly[]) => {
        landCache = data;
        setLand(data);
      })
      .catch(() => undefined);
  }, []);

  // Render loop (canvas, imperative — avoids re-rendering React 60×/s).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();

    const project = (lat: number, lng: number, R: number, cx: number, cy: number) => {
      const phi = lat * DEG;
      const lambda = (lng + rot.current.lng) * DEG;
      const phi0 = rot.current.lat * DEG;
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);
      const cosL = Math.cos(lambda);
      const x = cosPhi * Math.sin(lambda);
      const y = Math.cos(phi0) * sinPhi - Math.sin(phi0) * cosPhi * cosL;
      const z = Math.sin(phi0) * sinPhi + Math.cos(phi0) * cosPhi * cosL;
      return { x: cx + R * x, y: cy - R * y, z };
    };

    const draw = (now: number) => {
      const dt = now - last;
      last = now;
      if (spin.current && !drag.current) rot.current.lng += dt * 0.004;

      const dpr = window.devicePixelRatio || 1;
      const size = canvas.clientWidth;
      if (canvas.width !== size * dpr) {
        canvas.width = size * dpr;
        canvas.height = size * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      const R = size / 2 - 14;
      const cx = size / 2;
      const cy = size / 2;
      const maxCount = origins.reduce((m, o) => Math.max(m, o.count), 1);

      // Ocean
      const ocean = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
      ocean.addColorStop(0, '#2c4a55');
      ocean.addColorStop(0.6, '#1b2e36');
      ocean.addColorStop(1, '#0c1417');
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = ocean;
      ctx.fill();

      // Land
      if (land) {
        ctx.fillStyle = '#6b7f5a';
        ctx.strokeStyle = 'rgba(250,245,234,0.18)';
        ctx.lineWidth = 0.4;
        for (const poly of land) {
          for (const ring of poly) {
            let started = false;
            let anyVisible = false;
            ctx.beginPath();
            for (const [lng, lat] of ring) {
              const p = project(lat, lng, R, cx, cy);
              if (p.z >= -0.02) {
                anyVisible = true;
                if (!started) {
                  ctx.moveTo(p.x, p.y);
                  started = true;
                } else {
                  ctx.lineTo(p.x, p.y);
                }
              } else {
                started = false;
              }
            }
            if (anyVisible) {
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
            }
          }
        }
      }

      // Graticule (subtle)
      ctx.strokeStyle = 'rgba(250,245,234,0.07)';
      ctx.lineWidth = 0.5;
      for (let lng = -180; lng < 180; lng += 30) {
        ctx.beginPath();
        let started = false;
        for (let lat = -90; lat <= 90; lat += 4) {
          const p = project(lat, lng, R, cx, cy);
          if (p.z >= 0) {
            if (!started) (ctx.moveTo(p.x, p.y), (started = true));
            else ctx.lineTo(p.x, p.y);
          } else started = false;
        }
        ctx.stroke();
      }

      // Origin points
      for (const o of origins) {
        const p = project(o.lat, o.lng, R, cx, cy);
        if (p.z < 0) continue;
        const r = 3 + (o.count / maxCount) * 11;
        const active = hover.current === o.code;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
        ctx.fillStyle = active ? 'rgba(184,69,31,0.4)' : 'rgba(184,69,31,0.2)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = active ? '#d2683f' : '#b8451f';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(250,245,234,0.7)';
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [land, origins]);

  // ── Interaction ──────────────────────────────────────────────────────
  const hit = (e: React.PointerEvent): Origin | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const size = rect.width;
    const R = size / 2 - 14;
    const cx = size / 2;
    const cy = size / 2;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const maxCount = origins.reduce((m, o) => Math.max(m, o.count), 1);
    for (const o of origins) {
      const phi = o.lat * DEG;
      const lambda = (o.lng + rot.current.lng) * DEG;
      const phi0 = rot.current.lat * DEG;
      const cosPhi = Math.cos(phi);
      const z = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * cosPhi * Math.cos(lambda);
      if (z < 0) continue;
      const x = cx + R * (cosPhi * Math.sin(lambda));
      const y = cy - R * (Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * cosPhi * Math.cos(lambda));
      const r = 3 + (o.count / maxCount) * 11 + 4;
      if ((mx - x) ** 2 + (my - y) ** 2 <= r * r) return o;
    }
    return null;
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, lng: rot.current.lng, lat: rot.current.lat };
  };
  const onMove = (e: React.PointerEvent) => {
    if (drag.current) {
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      rot.current.lng = drag.current.lng + dx * 0.4;
      rot.current.lat = Math.max(-85, Math.min(85, drag.current.lat + dy * 0.4));
    } else {
      const o = hit(e);
      hover.current = o?.code ?? null;
      if (canvasRef.current) canvasRef.current.style.cursor = o ? 'pointer' : 'grab';
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const wasDragging = drag.current;
    drag.current = null;
    if (wasDragging && Math.abs(e.clientX - wasDragging.x) < 4 && Math.abs(e.clientY - wasDragging.y) < 4) {
      const o = hit(e);
      if (o) onSelect(o.name);
    }
  };

  return (
    <div className="relative mx-auto w-full max-w-[520px] select-none">
      <canvas
        ref={canvasRef}
        className="aspect-square w-full cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => (drag.current = null)}
      />
      <button
        onClick={() => {
          spin.current = !spin.current;
          setSpinUi(spin.current);
        }}
        className="absolute bottom-2 right-2 rounded-full bg-ink/70 px-3 py-1 text-xs text-cream hover:bg-ink"
      >
        {spinUi ? '⏸ Rotation' : '▶ Rotation'}
      </button>
    </div>
  );
}
