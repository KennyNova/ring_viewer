"use client";

import { useEffect, useRef, useState } from "react";

/** Horizontal scroll-snap row with prev/next arrows for mouse users. */
export default function Shelf({ children, label }: { children: React.ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setEdges({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const page = (direction: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div ref={ref} className="ring-shelf" role="region" aria-label={label}>
        {children}
      </div>
      <div className="mt-6 hidden justify-end gap-2 sm:flex">
        <button className="icon-btn" aria-label="Previous rings" disabled={edges.start} onClick={() => page(-1)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <button className="icon-btn" aria-label="More rings" disabled={edges.end} onClick={() => page(1)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
