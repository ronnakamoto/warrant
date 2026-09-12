"use client";

import { useEffect, useRef, useState } from "react";
import type { GuestScopeName } from "../lib/guest-copy";

const SLOT: Record<GuestScopeName, { x: number; w: number }> = {
  fetch: { x: 390, w: 420 },
  translate: { x: 320, w: 560 },
  both: { x: 280, w: 640 },
};

/** Document lines under the missing name. [x, y, width] */
const LINES: Record<GuestScopeName, readonly [number, number, number][]> = {
  fetch: [
    [400, 228, 200],
    [400, 248, 340],
    [400, 268, 168],
  ],
  translate: [
    [340, 232, 420],
    [340, 256, 292],
  ],
  both: [
    [300, 224, 188],
    [300, 244, 380],
    [300, 264, 148],
    [300, 284, 256],
  ],
};

export function LandViz({ scope }: { scope: GuestScopeName }) {
  const ref = useRef<SVGSVGElement>(null);
  const [run, setRun] = useState(true);
  const slot = SLOT[scope];
  const path = `M${slot.x + 24} 182 H${slot.x + slot.w - 24}`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setRun(Boolean(entry?.isIntersecting)),
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <svg
      ref={ref}
      className="land-viz"
      viewBox="0 0 1200 380"
      data-scope={scope}
      data-run={run ? "true" : "false"}
      aria-hidden="true"
    >
      <rect className="land-viz-field" x="0" y="0" width="1200" height="380" />
      <rect className="land-viz-you" x="64" y="168" width="28" height="28" />
      <rect className="land-viz-fire" x="1108" y="168" width="28" height="28" />
      <path className="land-viz-strike" d="M1102 182 H1142" />
      <rect
        key={`slot-${scope}`}
        className="land-viz-slot"
        x={slot.x}
        y="158"
        width={slot.w}
        height="48"
      />
      {LINES[scope].map(([x, y, width]) => (
        <rect
          key={`${scope}-${x}-${y}-${width}`}
          className="land-viz-bar"
          x={x}
          y={y}
          width={width}
          height="6"
        />
      ))}
      <rect
        className="land-viz-courier"
        width="8"
        height="8"
        style={{ offsetPath: `path('${path}')` }}
      />
    </svg>
  );
}
