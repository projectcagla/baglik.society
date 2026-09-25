'use client';

import { useEffect, useState } from 'react';
import styles from './Desk.module.css';

// Keeps an unsaved copy of a desk form's text fields in this browser only
// (localStorage), so a closed tab or lost connection does not lose writing.
// Cleared as soon as the server confirms a save.
export function DraftKeeper({ formId, saved }: { formId: string; saved: boolean }) {
  const key = `bs-draft:${formId}`;
  const [pending, setPending] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const draft = JSON.parse(raw) as Record<string, string>;
        const differs = Object.entries(draft).some(([name, value]) => {
          const el = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;
          return el && 'value' in el && el.value !== value;
        });
        // deferred: state follows an external store (localStorage), not render
        if (differs) queueMicrotask(() => setPending(draft));
        else localStorage.removeItem(key);
      }
    } catch {
      /* storage unavailable */
    }
    let t: ReturnType<typeof setTimeout> | undefined;
    const onInput = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const data: Record<string, string> = {};
        for (const el of Array.from(form.elements)) {
          const f = el as HTMLInputElement | HTMLTextAreaElement;
          if (
            f.name &&
            (f.tagName === 'TEXTAREA' ||
              (f.tagName === 'INPUT' && ['text', 'url', ''].includes((f as HTMLInputElement).type)))
          ) {
            data[f.name] = f.value;
          }
        }
        try {
          localStorage.setItem(key, JSON.stringify(data));
        } catch {
          /* ignore */
        }
      }, 800);
    };
    form.addEventListener('input', onInput);
    return () => {
      form.removeEventListener('input', onInput);
      clearTimeout(t);
    };
  }, [formId, key]);

  useEffect(() => {
    if (saved) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
  }, [saved, key]);

  if (!pending) return null;
  const restore = () => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (form) {
      for (const [name, value] of Object.entries(pending)) {
        const el = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;
        if (el && 'value' in el) el.value = value;
      }
    }
    setPending(null);
  };
  const discard = () => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    setPending(null);
  };
  return (
    <div className={styles.tools} role="status">
      <span className="meta">bu tarayıcıda kaydedilmemiş bir taslak var.</span>
      <button type="button" className={styles.tool} onClick={restore}>
        geri yükle
      </button>
      <button type="button" className={styles.tool} onClick={discard}>
        at
      </button>
    </div>
  );
}
