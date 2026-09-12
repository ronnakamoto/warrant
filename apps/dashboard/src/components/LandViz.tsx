import { LAND_DAY, landDayFor, type GuestScopeName } from "../lib/guest-copy";

const BARS: Record<GuestScopeName, readonly number[]> = {
  fetch: [42, 72, 36],
  translate: [88, 58],
  both: [40, 80, 32, 54],
};

export function LandViz({ scope }: { scope: GuestScopeName }) {
  const day = landDayFor(scope);
  const beats = [
    { key: "you", name: LAND_DAY.you, foot: LAND_DAY.youFoot },
    { key: "bot", name: LAND_DAY.bot, foot: LAND_DAY.botFoot },
    { key: "act", name: day.act, foot: day.actFoot },
    { key: "fire", name: LAND_DAY.fire, foot: LAND_DAY.fireFoot },
  ] as const;

  return (
    <figure className="land-viz" data-scope={scope}>
      <ol className="land-viz-beats">
        {beats.map((beat) => (
          <li
            key={`${scope}-${beat.key}`}
            className="land-viz-beat"
            data-beat={beat.key}
            data-live={beat.key === "act" ? "true" : undefined}
          >
            {beat.key === "act" ? (
              <div className="land-viz-act" aria-hidden="true">
                <span className="land-viz-blank" />
                {BARS[scope].map((width) => (
                  <span
                    key={`${scope}-${width}`}
                    className="land-viz-bar"
                    style={{ width: `${width}%` }}
                  />
                ))}
              </div>
            ) : (
              <span className={`land-viz-mark land-viz-mark--${beat.key}`} aria-hidden="true" />
            )}
            <strong className="land-viz-title">{beat.name}</strong>
            <span className="land-viz-foot">{beat.foot}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
