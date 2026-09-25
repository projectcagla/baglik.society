'use client';

import { Quiet } from '@/components/ui/Quiet';
import ui from '@/components/ui/ui.module.css';

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Quiet title="bir şey ters gitti.">
      <p>ayrıntı kaydedildi. yeniden denemek çoğu zaman yeter.</p>
      <button type="button" className={ui.button} onClick={reset}>
        yeniden dene
      </button>
    </Quiet>
  );
}
