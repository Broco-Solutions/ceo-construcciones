'use client';
import { Page, RequirePerm } from '@/components/shell';
import { useSession } from '@/lib/session';
import { PriceImport } from '@/components/catalogo/PriceImport';
export default function ImportPrices() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('readEconomic')}>
      <Page title="Importar lista de precios">
        <PriceImport />
      </Page>
    </RequirePerm>
  );
}
