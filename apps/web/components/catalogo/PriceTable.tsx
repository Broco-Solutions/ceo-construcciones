'use client';
import { unitSymbol } from '@/lib/units';
import Link from 'next/link';
import { useMemo } from 'react';
import { useAll, usePaged, useApi } from '@/lib/hooks';
import {
  formatReferenceDate,
  formatDateTime,
  formatMoney,
  formatQty,
  pricePerBaseUnit,
} from '@/lib/format';
import {
  Button,
  DataTable,
  Empty,
  ErrorBox,
  Loading,
  PagerBar,
  Pill,
  type Column,
} from '@/components/ui';
import {
  TAX_BASIS_LABEL,
  useSuppliers,
  useUnits,
  type Material,
  type MaterialPrice,
  type Presentation,
} from './common';

function renderPriceDetails(p: MaterialPrice) {
  return (
    <details className="price-table-details small">
      <summary>Ver detalle</summary>
      <div><b>Fuente:</b> {p.source ?? '—'}</div>
      <div><b>Fecha de registro:</b> {formatDateTime(p.createdAt)}</div>
    </details>
  );
}

/** Remontar con `key` para recargar. Historial de precios (sólo roles económicos: el padre no debe montarlo para Jefe de Obra). */
export function PriceTable({
  materialId,
  supplierId,
  unitCode,
  empty,
  onRegisterReference,
  compactCosts = false,
}: {
  materialId?: string;
  supplierId?: string;
  unitCode?: string;
  empty?: React.ReactNode;
  onRegisterReference?: (price: MaterialPrice) => void;
  compactCosts?: boolean;
}) {
  const list = usePaged<MaterialPrice>('/prices', { materialId, supplierId });
  const units = useUnits();
  const suppliers = useSuppliers(list.rows.some(p=>p.supplierId&&!p.supplier));
  const mats = useAll<Material>(!materialId&&list.rows.some(p=>!p.material)?'/materials':null);
  const pres = useAll<Presentation>(list.rows.some(p=>p.presentationId&&!p.presentation)?'/presentations':null, { materialId });
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
    const m = p.material ?? selectedMaterial.data?.data ?? matMap.get(p.materialId);
    return m ? unitSymbol(m.unit??units.map.get(m.unitId)) : '';
  };
  if (list.error) return <ErrorBox error={list.error} onRetry={list.reload} />;
  if (list.loading && !list.data) return <Loading />;
  const referenceDate = (p: MaterialPrice) =>
    formatReferenceDate(
      p.referenceDate ?? p.effectiveAt,
      p.referenceDatePrecision ?? 'DAY',
    );
  const per = (p: MaterialPrice, u: string) => {
    const pr = p.presentation ?? (p.presentationId ? presMap.get(p.presentationId) : null);
    return pr
      ? `1 ${pr.name} (${formatQty(p.baseQuantity, u)})`
      : formatQty(p.baseQuantity, u);
  };
  const basePrice = (p: MaterialPrice) => {
    const unit = unitOf(p);
    const value = unit ? pricePerBaseUnit(p.price, p.baseQuantity) : null;
    return value === null ? '—' : `${formatMoney(value, p.currency)}/${unit}`;
  };
  const actionColumn: Column<MaterialPrice> = {
    key: 'new-reference',
    header: compactCosts ? 'Acción' : '',
    render: (p) => (
      <>
        {compactCosts && renderPriceDetails(p)}
        {onRegisterReference && (
          <Button
            variant="sec"
            size="sm"
            className="price-table-action"
            onClick={() => onRegisterReference(p)}
          >
            {compactCosts ? 'Actualizar costo' : 'Actualizar esta referencia'}
          </Button>
        )}
      </>
    ),
  };
  const dateColumn: Column<MaterialPrice> = {
    key: 'eff',
    header: compactCosts ? 'Fecha de vigencia' : 'Fecha de referencia',
    render: (p) => (
      <>
        <span className="price-table-nowrap">{referenceDate(p)}</span>
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
  };
  const priceColumns: Column<MaterialPrice>[] = [
    ...(materialId
      ? []
      : [
          {
            key: 'mat',
            header: 'Material',
            render: (p: MaterialPrice) => (
              <Link className="price-table-material" href={`/materiales/${p.materialId}`}>
                {p.material?.name ?? matMap.get(p.materialId)?.name ?? '…'}
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
            render: (p: MaterialPrice) => (
              <span className="price-table-supplier">
                {p.supplierId ? (
                  <Link href={`/proveedores/${p.supplierId}`}>
                    {p.supplier?.name ?? suppliers.map.get(p.supplierId)?.name ?? '…'}
                  </Link>
                ) : (
                  <span className="muted">Sin proveedor</span>
                )}
              </span>
            ),
          },
        ]),
    {
      key: 'price',
      header: 'Precio',
      align: 'r',
      render: (p) => <b>{formatMoney(p.price, p.currency)}</b>,
    },
    {
      key: 'per',
      header: 'Presentación',
      render: (p) => <span className="price-table-presentation">{per(p, unitOf(p))}</span>,
    },
    {
      key: 'base-price',
      header: 'Precio por unidad base',
      align: 'r',
      render: compactCosts ? (p) => <b>{basePrice(p)}</b> : basePrice,
    },
    {
      key: 'tax',
      header: 'Base impositiva',
      render: (p) => (
        <Pill tone={p.taxBasis === 'UNSPECIFIED' ? 'warn' : 'plain'}>
          {TAX_BASIS_LABEL[p.taxBasis]}
        </Pill>
      ),
    },
  ];
  const recordColumns: Column<MaterialPrice>[] = [
    {
      key: 'src',
      header: 'Fuente',
      render: (p) => <span className="price-table-source">{p.source ?? '—'}</span>,
      hideMobile: true,
    },
    {
      key: 'cr',
      header: 'Registrado',
      render: (p) => (
        <span className="small muted price-table-nowrap">{formatDateTime(p.createdAt)}</span>
      ),
      hideMobile: true,
    },
  ];
  return (
    <div className={compactCosts ? 'price-table price-table--costs' : 'price-table'}>
      <DataTable collection={{resource:"prices",filters:{materialId,supplierId},total:list.pagination?.total,reload:list.reload}}
        rows={list.rows}
        rowKey={(p) => p.id}
        empty={empty ?? <Empty title="Sin precios registrados" />}
        columns={
          compactCosts
            ? [...priceColumns, dateColumn, actionColumn]
            : [
                ...(onRegisterReference ? [actionColumn] : []),
                dateColumn,
                ...priceColumns,
                ...recordColumns,
              ]
        }
        mobile={(p) => (
          <div className="stack" style={{ gap: 4 }}>
            <div className="row">
              <b style={{ flex: 1 }}>{formatMoney(p.price, p.currency)}</b>
              <Pill tone={p.taxBasis === 'UNSPECIFIED' ? 'warn' : 'plain'}>
                {TAX_BASIS_LABEL[p.taxBasis]}
              </Pill>
            </div>
            {!materialId && (
              <span>{p.material?.name ?? matMap.get(p.materialId)?.name ?? '…'}</span>
            )}
            {compactCosts ? (
              <>
                {!supplierId && (
                  <span className="small muted">
                    Proveedor · {p.supplierId ? (p.supplier?.name ?? suppliers.map.get(p.supplierId)?.name ?? '…') : 'Sin proveedor'}
                  </span>
                )}
                <span className="small muted">Presentación · {per(p, unitOf(p))}</span>
              </>
            ) : (
              <span className="small muted">
                Presentación · {per(p, unitOf(p))} · desde {referenceDate(p)}
                {!supplierId &&
                  ` · ${p.supplierId ? (p.supplier?.name ?? suppliers.map.get(p.supplierId)?.name ?? '…') : 'sin proveedor'}`}
              </span>
            )}
            {compactCosts ? (
              <span className="small">
                Precio por unidad base · <b className="price-table-nowrap">{basePrice(p)}</b>
              </span>
            ) : (
              <span className="small">Precio por unidad base · {basePrice(p)}</span>
            )}
            {compactCosts && (
              <span className="small muted">Fecha de vigencia · {referenceDate(p)}</span>
            )}
            {p.referenceState === 'HISTORICAL' && (
              <span className="small muted">
                Referencia histórica
                {p.referenceDatePrecision === 'MONTH'
                  ? ' · día no informado'
                  : ''}
              </span>
            )}
            {compactCosts && renderPriceDetails(p)}
            {onRegisterReference && (
              <Button
                variant="sec"
                size="sm"
                onClick={() => onRegisterReference(p)}
              >
                {compactCosts ? 'Actualizar costo' : 'Actualizar esta referencia'}
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
    </div>
  );
}
