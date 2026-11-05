'use client';
import { BatchActions } from '@/components/inventario/InventoryBatch';
import { useAppRouter } from '@/lib/navigation';
import { Suspense } from 'react';
import { useSession } from '@/lib/session';
import { Page, RequirePerm } from '@/components/shell';
import { Loading } from '@/components/ui';
import { MovementForm } from '@/components/inventario/MovementForm';

export default function NuevoMovimientoPage() {
  const { can, user } = useSession();
  const router=useAppRouter();
  return (
    <RequirePerm ok={can('consume')}>
      <Page title={user?.role === 'JEFE_OBRA' ? 'Consumo o devolución' : 'Registrar movimiento'} crumb="Inventario · Movimientos" actions={<BatchActions onSaved={()=>router.push('/stock/movimientos')}/>}>
        <Suspense fallback={<Loading />}>
          <MovementForm />
        </Suspense>
      </Page>
    </RequirePerm>
  );
}
