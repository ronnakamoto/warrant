import Link from "next/link";
import { GUEST_COPY } from "../lib/guest-copy";

export function SiteChrome({ wide = false }: { wide?: boolean }) {
  return (
    <header className={wide ? "site-chrome site-chrome--wide" : "site-chrome"}>
      <Link href="/" className="site-wordmark">
        {GUEST_COPY.warrantTab}
      </Link>
      <nav className="site-nav">
        <Link href="/docs">{GUEST_COPY.docs}</Link>
      </nav>
    </header>
  );
}
