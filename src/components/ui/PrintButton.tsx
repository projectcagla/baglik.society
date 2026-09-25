'use client';

import ui from './ui.module.css';

export function PrintButton({ label = 'yazdır / pdf' }: { label?: string }) {
  return (
    <button
      type="button"
      className={`${ui.button} ${ui.small} no-print`}
      onClick={() => window.print()}
    >
      {label}
    </button>
  );
}
