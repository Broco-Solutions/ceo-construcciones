'use client';
import { unitSymbol } from '@/lib/units';
import Link from 'next/link';
import { useMemo } from 'react';
import { useAll, usePaged } from '@/lib/hooks';
import { formatDate, formatDateTime, formatMoney, formatQty } from '@/lib/format';
import { DataTable, Empty, ErrorBox, Loading, PagerBar, Pill } from '@/components/ui';
import { TAX_BASIS_LABEL, useSuppliers, useUnits, type Material, type MaterialPrice, type Presentation } from './common';

/** Remontar con `key` para recargar. Historial de precios (sólo roles económicos: el padre no debe montarlo para Jefe de Obra). */
export function PriceTable({ materialId, supplierId, unitCode, empty }: { materialId?: string; supplierId?: string; unitCode?: string; empty?: React.ReactNode }) {
  const list = usePaged<MaterialPrice>('/prices', { materialId, supplierId });
  const units = useUnits();
  const suppliers = useSuppliers(true);
  const mats = useAll<Material>(materialId ? null : '/materials');
  const pres = useAll<Presentation>('/presentations', { materialId });
  const matMap = useMemo(() => new Map(mats.rows.map((m) => [m.id, m])), [mats.rows]);
  const presMap = useMemo(() => new Map(pres.rows.map((p) => [p.id, p])), [pres.rows]);
  const unitOf = (p: MaterialPrice) => {
    if (unitCode) return unitCode;
    const m = matMap.get(p.materialId);
    return m ? unitSymbol(units.map.get(m.unitId)) : '';
  };
  if (list.error) return <ErrorBox error={list.error} onRetry={list.reload} />;
  if (list.loading && !list.data) return <Loading />;
  const per = (p: MaterialPrice, u: string) => {
    const pr = p.presentationId ? presMap.get(p.presentationId) : null;
    return pr ? `1 ${pr.name} (${formatQty(p.baseQuantity, u)})` : formatQty(p.baseQuantity, u);
  };
  return (
    <>
      <DataTable
        rows={list.rows}
        rowKey={(p) => p.id}
        empty={empty ?? <Empty title="Sin precios registrados" />}
        columns={[
          { key: 'eff', header: 'Vigente desde', render: (p) => formatDate(p.effectiveAt) },
          ...(materialId
            ? []
            : [{ key: 'mat', header: 'Material', render: (p: MaterialPrice) => <Link href={`/materiales/${p.materialId}`}>{matMap.get(p.materialId)?.name ?? '…'}</Link> }]),
          ...(supplierId
            ? []
            : [
                {
                  key: 'sup',
                  header: 'Proveedor',
                  render: (p: MaterialPrice) => (p.supplierId ? <Link href={`/proveedores/${p.supplierId}`}>{suppliers.map.get(p.supplierId)?.name ?? '…'}</Link> : <span className="muted">Sin proveedor</span>),
                },
              ]),
          { key: 'price', header: 'Precio', align: 'r', render: (p) => <b>{formatMoney(p.price, p.currency)}</b> },
          { key: 'per', header: 'Por', render: (p) => per(p, unitOf(p)) },
          { key: 'tax', header: 'Base impositiva', render: (p) => <Pill tone={p.taxBasis === 'UNSPECIFIED' ? 'warn' : 'plain'}>{TAX_BASIS_LABEL[p.taxBasis]}</Pill> },
          { key: 'src', header: 'Fuente', render: (p) => p.source ?? '—', hideMobile: true },
          { key: 'cr', header: 'Registrado', render: (p) => <span className="small muted">{formatDateTime(p.createdAt)}</span>, hideMobile: true },
        ]}
        mobile={(p) => (
          <div className="stack" style={{ gap: 4 }}>
            <div className="row">
              <b style={{ flex: 1 }}>{formatMoney(p.price, p.currency)}</b>
              <Pill tone={p.taxBasis === 'UNSPECIFIED' ? 'warn' : 'plain'}>{TAX_BASIS_LABEL[p.taxBasis]}</Pill>
            </div>
            {!materialId && <span>{matMap.get(p.materialId)?.name ?? '…'}</span>}
            <span className="small muted">
              por {per(p, unitOf(p))} · desde {formatDate(p.effectiveAt)}
              {!supplierId && ` · ${p.supplierId ? (suppliers.map.get(p.supplierId)?.name ?? '…') : 'sin proveedor'}`}
            </span>
          </div>
        )}
      />
      <PagerBar pagination={list.pagination} page={list.page} setPage={list.setPage} />
    </>
  );
}
