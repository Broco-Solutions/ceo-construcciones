'use client';

import { useEffect } from 'react';
import './globals.css';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="es-AR">
      <body>
        <main className="global-error-screen">
          <h1>Algo salió mal</h1>
          <button type="button" className="btn" onClick={reset}>Reintentar</button>
        </main>
      </body>
    </html>
  );
}
