'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Page } from '@/components/shell';

export default function AppError({
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
    <Page title="Algo salió mal">
      <div className="card">
        <div className="bd stack">
          <p>No pudimos mostrar esta pantalla. Intentá de nuevo o volvé al inicio.</p>
          <div className="row">
            <button type="button" className="btn" onClick={reset}>Reintentar</button>
            <Link href="/" className="btn sec">Ir al inicio</Link>
          </div>
        </div>
      </div>
    </Page>
  );
}
