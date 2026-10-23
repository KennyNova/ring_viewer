"use client";

import { useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';

// Line-art diamond whose facets draw in as progress rises
const FACETS = [
  'M20 20 L80 20',
  'M20 20 L8 36',
  'M80 20 L92 36',
  'M8 36 L92 36',
  'M20 20 L36 36 L50 20 L64 36 L80 20',
  'M8 36 L50 90',
  'M92 36 L50 90',
  'M36 36 L50 90',
  'M64 36 L50 90',
];

export function DiamondLoader({ progress }: { progress: number }) {
  return (
    <svg width="96" height="96" viewBox="0 0 100 100" fill="none" aria-hidden>
      {FACETS.map((d) => (
        <path key={`ghost-${d}`} d={d} stroke="var(--line)" strokeWidth="1.2" strokeLinejoin="round" />
      ))}
      {FACETS.map((d, i) => {
        const start = i / FACETS.length;
        const local = Math.min(1, Math.max(0, (progress - start) * FACETS.length));
        return (
          <path
            key={d}
            d={d}
            stroke="var(--ink)"
            strokeWidth="1.2"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={1 - local}
            style={{ transition: 'stroke-dashoffset 0.4s ease' }}
          />
        );
      })}
    </svg>
  );
}

/** Full-stage overlay that fades out once every asset reported by drei has loaded. */
export function CombinedLoader({ ready }: { ready: boolean }) {
  const { progress, active } = useProgress();
  const [hidden, setHidden] = useState(false);
  const done = ready && !active;

  useEffect(() => {
    if (!done) return setHidden(false);
    const t = setTimeout(() => setHidden(true), 700);
    return () => clearTimeout(t);
  }, [done]);

  if (hidden) return null;
  const shown = done ? 100 : Math.min(progress, 99);

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center"
      style={{
        background: 'var(--paper)',
        opacity: done ? 0 : 1,
        transition: 'opacity 0.7s ease',
        pointerEvents: done ? 'none' : 'auto',
      }}
    >
      <DiamondLoader progress={shown / 100} />
      <p className="eyebrow mt-6">Preparing your ring</p>
      <div className="mt-4 h-px w-40" style={{ background: 'var(--line)' }}>
        <div className="h-px" style={{ width: `${shown}%`, background: 'var(--ink)', transition: 'width 0.3s ease' }} />
      </div>
    </div>
  );
}
