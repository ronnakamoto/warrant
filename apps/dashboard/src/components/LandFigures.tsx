import { LAND_FIGURES } from "../lib/guest-copy";

export function LandFigures() {
  return (
    <div className="land-figures">
      {LAND_FIGURES.map((figure) => (
        <figure key={figure.src} className="land-figure">
          <figcaption>{figure.title}</figcaption>
          <div className="land-figure-frame">
            <img src={figure.src} alt={figure.alt} />
          </div>
        </figure>
      ))}
    </div>
  );
}
