import type { ReactNode } from "react";
import Link from "next/link";
import { GUEST_COPY } from "../lib/guest-copy";
import {
  DOCS_COPY,
  DOCS_DIAGRAMS,
  DOCS_EXCALIDRAW,
  DOCS_NAV,
  DOCS_SECTIONS,
  type DocsBlock,
} from "../lib/docs-copy";
import { DiagramChain, DiagramFire, DiagramLoop, DiagramSees } from "./ProtocolDiagrams";

const figures = {
  loop: DiagramLoop,
  chain: DiagramChain,
  sees: DiagramSees,
  fire: DiagramFire,
} as const;

function RichText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) =>
    part.startsWith("`") && part.endsWith("`") && part.length >= 2 ? (
      <code key={i}>{part.slice(1, -1)}</code>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function Block({ block }: { block: DocsBlock }) {
  switch (block.kind) {
    case "p":
      return (
        <p>
          <RichText text={block.text} />
        </p>
      );
    case "h3":
      return <h3>{block.text}</h3>;
    case "ul":
      return (
        <ul>
          {block.items.map((item) => (
            <li key={item}>
              <RichText text={item} />
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol>
          {block.items.map((item) => (
            <li key={item}>
              <RichText text={item} />
            </li>
          ))}
        </ol>
      );
    case "dl":
      return (
        <dl>
          {block.items.map((item) => (
            <div key={item.dt} className="docs-dl-row">
              <dt>{item.dt}</dt>
              <dd>
                <RichText text={item.dd} />
              </dd>
            </div>
          ))}
        </dl>
      );
    case "table":
      return (
        <div className="docs-table-wrap">
          <table>
            {block.caption ? <caption>{block.caption}</caption> : null}
            <thead>
              <tr>
                {block.headers.map((header) => (
                  <th key={header} scope="col">
                    <RichText text={header} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row.join("|")}>
                  {row.map((cell, i) => (
                    <td key={`${row[0]}-${i}`}>
                      <RichText text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "pre":
      return (
        <pre>
          <code>{block.text}</code>
        </pre>
      );
    case "note":
      return (
        <p className="docs-note">
          <RichText text={block.text} />
        </p>
      );
    case "internal":
      return (
        <p>
          <Link href={block.href}>{block.label === "Registry" ? GUEST_COPY.registry : block.label}</Link>
          {` — ${block.after}`}
        </p>
      );
  }
}

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

function Diagrams() {
  return (
    <>
      <figure className="docs-figure docs-figure--hero">
        <figcaption>{DOCS_EXCALIDRAW.title}</figcaption>
        <div className="docs-excalidraw">
          <img src={DOCS_EXCALIDRAW.src} alt={DOCS_EXCALIDRAW.alt} />
        </div>
      </figure>
      {DOCS_DIAGRAMS.map((d) => {
        const Figure = figures[d.id];
        return (
          <figure key={d.id} className="docs-figure">
            <figcaption>{d.title}</figcaption>
            <Figure />
          </figure>
        );
      })}
    </>
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

      {DOCS_SECTIONS.map((section) => (
        <Section key={section.id} id={section.id} title={section.title}>
          {section.blocks.map((block, i) => (
            <Block key={`${section.id}-${i}`} block={block} />
          ))}
          {section.id === "diagrams" ? <Diagrams /> : null}
        </Section>
      ))}
    </article>
  );
}
