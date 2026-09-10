import type { ReactNode } from "react";
import Link from "next/link";
import { GUEST_COPY } from "../lib/guest-copy";
import { DOCS_COPY, DOCS_DIAGRAMS, DOCS_NAV } from "../lib/docs-copy";
import { DiagramChain, DiagramFire, DiagramLoop, DiagramSees } from "./ProtocolDiagrams";

const figures = {
  loop: DiagramLoop,
  chain: DiagramChain,
  sees: DiagramSees,
  fire: DiagramFire,
} as const;

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="docs-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function ProtocolDocs() {
  return (
    <article className="docs">
      <header className="docs-lead">
        <h1>{DOCS_COPY.title}</h1>
        <p className="docs-standfirst">{DOCS_COPY.lead}</p>
      </header>

      <nav className="docs-toc" aria-label="On this page">
        {DOCS_NAV.map((item) => (
          <a key={item.href} href={item.href}>
            {item.label}
          </a>
        ))}
      </nav>

      <Section id="you" title="You already have a bot">
        <p>{DOCS_COPY.youHaveABot}</p>
      </Section>

      <Section id="do" title="What you do">
        <p>{DOCS_COPY.whatYouDo}</p>
      </Section>

      <Section id="saw" title="What each party saw">
        <p>{DOCS_COPY.whatYouSaw}</p>
        <p>{DOCS_COPY.whatWarrantSaw}</p>
        <p>{DOCS_COPY.whatChatSaw}</p>
        <p>{DOCS_COPY.whatShopSaw}</p>
      </Section>

      <Section id="machine" title="The machine">
        <p>{DOCS_COPY.theMachine}</p>
        <p>{DOCS_COPY.pay}</p>
      </Section>

      <Section id="diagrams" title="Diagrams">
        {DOCS_DIAGRAMS.map((d) => {
          const Figure = figures[d.id];
          return (
            <figure key={d.id} className="docs-figure">
              <figcaption>{d.title}</figcaption>
              <Figure />
            </figure>
          );
        })}
      </Section>

      <Section id="not" title="What this is not">
        <p>{DOCS_COPY.whatThisIsNot}</p>
      </Section>

      <Section id="shop" title="If you run a shop">
        <p>{DOCS_COPY.wrapShop}</p>
        <p>
          <Link href="/registry">{GUEST_COPY.registry}</Link>
          {` — ${DOCS_COPY.registryFoot}`}
        </p>
      </Section>
    </article>
  );
}
