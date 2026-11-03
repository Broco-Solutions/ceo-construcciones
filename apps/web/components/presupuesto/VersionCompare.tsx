'use client';
import type { Schemas } from '@/lib/api';
import { formatMoney, formatQty } from '@/lib/format';
import { TAX_LABEL } from './common';

type V = Schemas['BudgetVersion'];

/** Comparación lado a lado con los valores guardados por el backend (sin diferencias calculadas). */
export function VersionCompare({ a, b }: { a: V; b: V }) {
  const sa = a.snapshot;
  const sb = b.snapshot;
  const m = (s: string | undefined, cur: string) =>
    s === undefined ? (
      <span className="muted">No incluido</span>
    ) : (
      formatMoney(s, cur)
    );
  const sameCurrency = a.currency === b.currency && a.taxBasis === b.taxBasis;

  const catIds = [
    ...new Set([
      ...sa.categories.map((c) => c.categoryId),
      ...sb.categories.map((c) => c.categoryId),
    ]),
  ];
  const itemIds = [
    ...new Set([
      ...sa.lines.map((l) => l.itemId),
      ...sb.lines.map((l) => l.itemId),
    ]),
  ];
  const matIds = [
    ...new Set([
      ...sa.materials.map((x) => x.materialId),
      ...sb.materials.map((x) => x.materialId),
    ]),
  ];
  const Row = ({
    label,
    va,
    vb,
    strong,
  }: {
    label: React.ReactNode;
    va: React.ReactNode;
    vb: React.ReactNode;
    strong?: boolean;
  }) => (
    <tr>
      <td>{strong ? <b>{label}</b> : label}</td>
      <td className="r">{va}</td>
      <td className="r">{vb}</td>
    </tr>
  );
  return (
    <div className="stack">
      {!sameCurrency && (
        <div className="alert warn small">
          Las versiones usan distinta moneda o base impositiva: los importes no
          son directamente comparables.
        </div>
      )}
      <div className="tblwrap">
        <table className="t">
          <thead>
            <tr>
              <th scope="col">Concepto</th>
              <th className="r" scope="col">
                Versión {a.number}
              </th>
              <th className="r" scope="col">
                Versión {b.number}
              </th>
            </tr>
          </thead>
          <tbody>
            <Row
              label="Cómputo"
              va={sa.computationName}
              vb={sb.computationName}
            />
            <Row
              label="Criterio"
              va={`${a.currency} · ${TAX_LABEL[a.taxBasis]} · ${a.precision} dec. · ${a.roundingMode}`}
              vb={`${b.currency} · ${TAX_LABEL[b.taxBasis]} · ${b.precision} dec. · ${b.roundingMode}`}
            />
            <Row
              label="Ajustes particulares"
              va={String(sa.overrides.length)}
              vb={String(sb.overrides.length)}
            />
            <Row
              label="Materiales"
              va={m(sa.materialCost, a.currency)}
              vb={m(sb.materialCost, b.currency)}
            />
            <Row
              label="Mano de obra"
              va={m(sa.laborCost, a.currency)}
              vb={m(sb.laborCost, b.currency)}
            />
            <Row
              strong
              label="Costo total"
              va={<b>{m(sa.totalCost, a.currency)}</b>}
              vb={<b>{m(sb.totalCost, b.currency)}</b>}
            />
            <tr>
              <th colSpan={3} scope="colgroup">
                Por rubro (total)
              </th>
            </tr>
            {catIds.map((id) => {
              const ca = sa.categories.find((c) => c.categoryId === id);
              const cb = sb.categories.find((c) => c.categoryId === id);
              return (
                <Row
                  key={id}
                  label={(ca ?? cb)!.name}
                  va={m(ca?.totalCost, a.currency)}
                  vb={m(cb?.totalCost, b.currency)}
                />
              );
            })}
            <tr>
              <th colSpan={3} scope="colgroup">
                Por ítem (cantidad · unitario · total)
              </th>
            </tr>
            {itemIds.map((id) => {
              const la = sa.lines.find((l) => l.itemId === id);
              const lb = sb.lines.find((l) => l.itemId === id);
              const cell = (
                l: Schemas['SnapshotLine'] | undefined,
                cur: string,
              ) =>
                l ? (
                  <span className="small">
                    {formatQty(l.quantity, l.unit)} ·{' '}
                    {formatMoney(l.totalUnitCost, cur)} ·{' '}
                    <b>{formatMoney(l.totalCost, cur)}</b>
                  </span>
                ) : (
                  <span className="muted">No incluido</span>
                );
              return (
                <Row
                  key={id}
                  label={(la ?? lb)!.name}
                  va={cell(la, a.currency)}
                  vb={cell(lb, b.currency)}
                />
              );
            })}
            <tr>
              <th colSpan={3} scope="colgroup">
                Materiales necesarios
              </th>
            </tr>
            {matIds.map((id) => {
              const ma = sa.materials.find((x) => x.materialId === id);
              const mb = sb.materials.find((x) => x.materialId === id);
              return (
                <Row
                  key={id}
                  label={(ma ?? mb)!.name}
                  va={
                    ma ? (
                      formatQty(ma.quantity, ma.unit)
                    ) : (
                      <span className="muted">No incluido</span>
                    )
                  }
                  vb={
                    mb ? (
                      formatQty(mb.quantity, mb.unit)
                    ) : (
                      <span className="muted">No incluido</span>
                    )
                  }
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
