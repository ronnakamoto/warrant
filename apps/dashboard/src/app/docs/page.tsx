import type { Metadata } from "next";
import { SiteChrome } from "../../components/SiteChrome";
import { ProtocolDocs } from "../../components/ProtocolDocs";

export const metadata: Metadata = {
  title: "How Warrant works",
  description: "You already have a bot. This is the key it carries when it acts.",
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
