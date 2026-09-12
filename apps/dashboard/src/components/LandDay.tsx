import { landDayFor, type GuestScopeName } from "../lib/guest-copy";
import { LandFigures } from "./LandFigures";

export function LandDay({ scope }: { scope: GuestScopeName }) {
  const day = landDayFor(scope);

  return (
    <section
      className="land-day"
      role="tabpanel"
      id="land-day-panel"
      aria-labelledby={`land-tab-${scope}`}
    >
      <LandFigures />
      <div className="land-day-live" key={scope}>
        <h2 className="land-story-title">{day.title}</h2>
        <p className="land-story">{day.story}</p>
      </div>
    </section>
  );
}
