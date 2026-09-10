"use client";

import { SiteChrome } from "../components/SiteChrome";
import { GuestTry } from "../components/GuestTry";

export default function HomePage() {
  return (
    <main className="site-page">
      <SiteChrome />
      <div className="site-col">
        <GuestTry />
      </div>
    </main>
  );
}
