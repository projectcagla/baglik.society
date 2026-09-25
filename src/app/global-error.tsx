'use client';

// Last-resort fallback: no app CSS is guaranteed here, so styles are inline.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="tr">
      <body
        style={{
          background: '#0A0A0C',
          color: '#F2EEF3',
          fontFamily: 'Georgia, serif',
          display: 'grid',
          placeItems: 'center',
          minHeight: '100vh',
          margin: 0,
        }}
      >
        <div style={{ textAlign: 'center', padding: 24 }}>
          <p style={{ fontStyle: 'italic', fontSize: 24 }}>bir şey ters gitti.</p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 16,
              background: 'none',
              color: 'inherit',
              border: '1px solid #463d4f',
              borderRadius: 999,
              padding: '10px 20px',
            }}
          >
            yeniden dene
          </button>
        </div>
      </body>
    </html>
  );
}
