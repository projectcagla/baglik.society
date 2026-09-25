'use client';

import { useEffect, useState } from 'react';
import styles from './Reading.module.css';

// "kaldığın yer": the last source the reader had on screen, remembered only
// in this browser (localStorage). Nothing about reading behaviour is sent to
// the server.
export function ReadingPlace({ storageKey }: { storageKey: string }) {
  const [place, setPlace] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    const key = `bs-okuma:${storageKey}`;
    try {
      const saved = localStorage.getItem(key);
      if (saved && !location.hash) {
        const parsed = JSON.parse(saved) as { id: string; title: string };
        if (document.getElementById(parsed.id)) queueMicrotask(() => setPlace(parsed));
      }
    } catch {
      /* storage unavailable: nothing to remember */
    }
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-reading-anchor]'));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          try {
            localStorage.setItem(
              key,
              JSON.stringify({ id: el.dataset.readingAnchor, title: el.dataset.readingTitle }),
            );
          } catch {
            /* ignore */
          }
        }
      },
      { rootMargin: '-40% 0px -55% 0px' },
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [storageKey]);

  if (!place) return null;
  return (
    <p className={styles.place}>
      <a href={`#${place.id}`}>
        kaldığın yer: <span>{place.title}</span> <span aria-hidden="true">↓</span>
      </a>
    </p>
  );
}
