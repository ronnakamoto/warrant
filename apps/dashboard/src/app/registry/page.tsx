"use client";

import { SiteChrome } from "../../components/SiteChrome";
import { Dashboard } from "../../components/Dashboard";

export default function RegistryPage() {
  return (
    <main className="site-page">
      <SiteChrome wide />
      <div className="site-col site-col--wide">
        <Dashboard embedded />
      </div>
    </main>
  );
}
