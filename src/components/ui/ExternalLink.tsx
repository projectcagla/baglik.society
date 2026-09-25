import type { ReactNode } from 'react';

/** Outbound link: new tab, no opener, no referrer (the private URL never leaks). */
export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer external" className={className}>
      {children}
      <span aria-hidden="true"> ↗</span>
      <span className="visually-hidden"> (dış bağlantı, yeni sekmede açılır)</span>
    </a>
  );
}
