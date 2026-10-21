'use client';
import { Suspense } from 'react';
import { useSession } from '@/lib/session';
import { Page, RequirePerm } from '@/components/shell';
import { Loading } from '@/components/ui';
import { MovementForm } from '@/components/inventario/MovementForm';

export default function NuevoMovimientoPage() {
  const { can, user } = useSession();
  return (
    <RequirePerm ok={can('consume')}>
      <Page title={user?.role === 'JEFE_OBRA' ? 'Consumo o devolución' : 'Registrar movimiento'} crumb="Inventario · Movimientos">
        <Suspense fallback={<Loading />}>
          <MovementForm />
        </Suspense>
      </Page>
    </RequirePerm>
  );
}
