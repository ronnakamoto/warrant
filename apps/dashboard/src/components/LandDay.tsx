import { LAND_DAY, landDayFor, type GuestScopeName } from "../lib/guest-copy";

export function LandDay({ scope }: { scope: GuestScopeName }) {
  const day = landDayFor(scope);
  const steps: { name: string; foot: string; live?: boolean }[] = [
    { name: LAND_DAY.you, foot: LAND_DAY.youFoot },
    { name: LAND_DAY.bot, foot: LAND_DAY.botFoot },
    { name: day.act, foot: day.actFoot, live: true },
    { name: LAND_DAY.fire, foot: LAND_DAY.fireFoot },
  ];

  return (
    <section
      className="land-day"
      role="tabpanel"
      id="land-day-panel"
      aria-labelledby={`land-tab-${scope}`}
    >
      <ol className="land-day-rail">
        {steps.map((step) => (
          <li
            key={`${scope}-${step.name}`}
            className="land-day-step"
            data-live={step.live ? "true" : undefined}
          >
            <span className="land-day-node" aria-hidden="true" />
            <strong className="land-day-name">{step.name}</strong>
            <span className="land-day-foot">{step.foot}</span>
          </li>
        ))}
      </ol>
      <div className="land-day-live" key={scope}>
        <h2 className="land-story-title">{day.title}</h2>
        <p className="land-story">{day.story}</p>
      </div>
    </section>
  );
}
