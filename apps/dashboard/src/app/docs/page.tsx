import type { Metadata } from "next";
import { SiteChrome } from "../../components/SiteChrome";
import { ProtocolDocs } from "../../components/ProtocolDocs";

export const metadata: Metadata = {
  title: "How Warrant works",
  description:
    "Protocol book: hops, Groth16, LeanIMT, eight public signals, and what each party sees.",
};

export default function DocsPage() {
  return (
    <main className="site-page">
      <SiteChrome wide />
      <div className="site-col site-col--wide">
        <ProtocolDocs />
      </div>
    </main>
  );
}
