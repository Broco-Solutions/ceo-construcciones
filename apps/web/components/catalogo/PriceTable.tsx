'use client';
import { unitSymbol } from '@/lib/units';
import Link from 'next/link';
import { useMemo } from 'react';
import { useAll, usePaged, useApi } from '@/lib/hooks';
import {
  formatDate,
  formatReferenceDate,
  formatDateTime,
  formatMoney,
  formatQty,
} from '@/lib/format';
import {
  Button,
  DataTable,
  Empty,
  ErrorBox,
  Loading,
  PagerBar,
  Pill,
} from '@/components/ui';
import {
  TAX_BASIS_LABEL,
  useSuppliers,
  useUnits,
  type Material,
  type MaterialPrice,
  type Presentation,
} from './common';

/** Remontar con `key` para recargar. Historial de precios (sólo roles económicos: el padre no debe montarlo para Jefe de Obra). */
export function PriceTable({
  materialId,
  supplierId,
  unitCode,
  empty,
  onRegisterReference,
}: {
  materialId?: string;
  supplierId?: string;
  unitCode?: string;
  empty?: React.ReactNode;
  onRegisterReference?: (price: MaterialPrice) => void;
}) {
  const list = usePaged<MaterialPrice>('/prices', { materialId, supplierId });
  const units = useUnits();
  const suppliers = useSuppliers(true);
  const mats = useAll<Material>(materialId ? null : '/materials');
  const pres = useAll<Presentation>('/presentations', { materialId });
  const matMap = useMemo(
    () => new Map(mats.rows.map((m) => [m.id, m])),
    [mats.rows],
  );
  const presMap = useMemo(
    () => new Map(pres.rows.map((p) => [p.id, p])),
    [pres.rows],
  );
  const selectedMaterial = useApi<{ data: Material }>(
    materialId && !unitCode ? `/materials/${materialId}` : null,
  );
  const unitOf = (p: MaterialPrice) => {
    if (unitCode) return unitCode;
    const m = selectedMaterial.data?.data ?? matMap.get(p.materialId);
    return m ? unitSymbol(units.map.get(m.unitId)) : '';
  };
  if (list.error) return <ErrorBox error={list.error} onRetry={list.reload} />;
  if (list.loading && !list.data) return <Loading />;
  const referenceDate = (p: MaterialPrice) =>
    formatReferenceDate(
      p.referenceDate ?? p.effectiveAt,
      p.referenceDatePrecision ?? 'DAY',
    );
  const per = (p: MaterialPrice, u: string) => {
    const pr = p.presentationId ? presMap.get(p.presentationId) : null;
    return pr
      ? `1 ${pr.name} (${formatQty(p.baseQuantity, u)})`
      : formatQty(p.baseQuantity, u);
  };
  return (
    <>
      <DataTable
        rows={list.rows}
        rowKey={(p) => p.id}
        empty={empty ?? <Empty title="Sin precios registrados" />}
        columns={[
          ...(onRegisterReference
            ? [
                {
                  key: 'new-reference',
                  header: '',
                  render: (p: MaterialPrice) => (
                    <Button
                      variant="sec"
                      size="sm"
                      onClick={() => onRegisterReference(p)}
                    >
                      Actualizar esta referencia
                    </Button>
                  ),
                },
              ]
            : []),
          {
            key: 'eff',
            header: 'Fecha de referencia',
            render: (p) => (
              <>
                {referenceDate(p)}
                {p.referenceState === 'HISTORICAL' && (
                  <div className="small muted">
                    Referencia histórica
                    {p.referenceDatePrecision === 'MONTH'
                      ? ' · día no informado'
                      : ''}
                  </div>
                )}
              </>
            ),
          },
          ...(materialId
            ? []
            : [
                {
                  key: 'mat',
                  header: 'Material',
                  render: (p: MaterialPrice) => (
                    <Link href={`/materiales/${p.materialId}`}>
                      {matMap.get(p.materialId)?.name ?? '…'}
                    </Link>
                  ),
                },
              ]),
          ...(supplierId
            ? []
            : [
                {
                  key: 'sup',
                  header: 'Proveedor',
                  render: (p: MaterialPrice) =>
                    p.supplierId ? (
                      <Link href={`/proveedores/${p.supplierId}`}>
                        {suppliers.map.get(p.supplierId)?.name ?? '…'}
                      </Link>
                    ) : (
                      <span className="muted">Sin proveedor</span>
                    ),
                },
              ]),
          {
            key: 'price',
            header: 'Precio',
            align: 'r',
            render: (p) => <b>{formatMoney(p.price, p.currency)}</b>,
          },
          { key: 'per', header: 'Por', render: (p) => per(p, unitOf(p)) },
          {
            key: 'tax',
            header: 'Base impositiva',
            render: (p) => (
              <Pill tone={p.taxBasis === 'UNSPECIFIED' ? 'warn' : 'plain'}>
                {TAX_BASIS_LABEL[p.taxBasis]}
              </Pill>
            ),
          },
          {
            key: 'src',
            header: 'Fuente',
            render: (p) => p.source ?? '—',
            hideMobile: true,
          },
          {
            key: 'cr',
            header: 'Registrado',
            render: (p) => (
              <span className="small muted">{formatDateTime(p.createdAt)}</span>
            ),
            hideMobile: true,
          },
        ]}
        mobile={(p) => (
          <div className="stack" style={{ gap: 4 }}>
            <div className="row">
              <b style={{ flex: 1 }}>{formatMoney(p.price, p.currency)}</b>
              <Pill tone={p.taxBasis === 'UNSPECIFIED' ? 'warn' : 'plain'}>
                {TAX_BASIS_LABEL[p.taxBasis]}
              </Pill>
            </div>
            {!materialId && (
              <span>{matMap.get(p.materialId)?.name ?? '…'}</span>
            )}
            <span className="small muted">
              por {per(p, unitOf(p))} · desde {referenceDate(p)}
              {!supplierId &&
                ` · ${p.supplierId ? (suppliers.map.get(p.supplierId)?.name ?? '…') : 'sin proveedor'}`}
            </span>
            {p.referenceState === 'HISTORICAL' && (
              <span className="small muted">
                Referencia histórica
                {p.referenceDatePrecision === 'MONTH'
                  ? ' · día no informado'
                  : ''}
              </span>
            )}
            {onRegisterReference && (
              <Button
                variant="sec"
                size="sm"
                onClick={() => onRegisterReference(p)}
              >
                Actualizar esta referencia
              </Button>
            )}
          </div>
        )}
      />
      <PagerBar
        pagination={list.pagination}
        page={list.page}
        setPage={list.setPage}
      />
    </>
  );
}
