'use client';
import { useState } from 'react';
import {
  Button,
  Card,
  ErrorBox,
  Loading,
  Pill,
  SelectField,
  useToast,
} from '@/components/ui';
import { useAll, useApi } from '@/lib/hooks';
import { api, type Schemas } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
export function PriceComparison({
  materialId,
  onSelect,
}: {
  materialId: string;
  onSelect?: (price: Schemas['MaterialPrice'], normalized: string) => void;
}) {
  const suppliers = useAll<Schemas['Supplier']>('/suppliers', { active: true }),
    [ids, setIds] = useState(['', '', '']),
    toast = useToast();
  const chosen = ids.filter(Boolean),
    q = useApi<{ data: Schemas['PriceComparison'] }>(
      chosen.length ? '/price-comparison' : null,
      { materialId, supplierIds: chosen.join(',') },
    );
  return (
    <Card title="Comparar corralones">
      <div className="formgrid">
        {ids.map((value, i) => (
          <SelectField
            key={i}
            label={`Proveedor ${i + 1}`}
            value={value}
            placeholder="Elegir proveedor…"
            options={suppliers.rows
              .filter((s) => s.id === value || !ids.includes(s.id))
              .map((s) => ({ value: s.id, label: s.name }))}
            onChange={(e) =>
              setIds((old) => old.map((v, n) => (n === i ? e.target.value : v)))
            }
          />
        ))}
      </div>
      <ErrorBox error={suppliers.error ?? q.error} />
      {q.loading ? (
        <Loading />
      ) : (
        q.data?.data.candidates.map((c, i) => (
          <div className="note stack" key={i}>
            <div className="row">
              <b>{c.supplier.name}</b>
              {c.lowest && <Pill tone="ok">Menor comparable</Pill>}
              {c.reviewDue && (
                <Pill tone="warn">Revisar referencias este mes</Pill>
              )}
            </div>
            {c.price ? (
              <>
                <span>
                  {formatMoney(c.price.price, c.price.currency)} por{' '}
                  {c.price.presentation?.name ?? q.data!.data.material.unit} ·
                  normalizado:{' '}
                  {formatMoney(c.normalizedPrice, c.price.currency)} /{' '}
                  {q.data!.data.material.unit}
                </span>
                <span className="small muted">
                  {c.price.taxBasis === 'INCLUDED'
                    ? 'IVA incluido'
                    : c.price.taxBasis === 'EXCLUDED'
                      ? '+ IVA'
                      : 'IVA no especificado'}{' '}
                  · vigente {formatDate(c.price.effectiveAt)} ·{' '}
                  {c.price.source ?? 'Carga manual'}
                </span>
                <div className="row">
                  {onSelect && c.normalizedPrice && (
                    <Button
                      size="sm"
                      variant="sec"
                      onClick={() => onSelect(c.price!, c.normalizedPrice!)}
                    >
                      Usar este precio
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="sec"
                    onClick={async () => {
                      try {
                        await api.post(`/price-review/${c.supplier.id}`);
                        toast.success('Revisión mensual registrada');
                        q.reload();
                      } catch (e) {
                        toast.failure('No se pudo guardar la revisión', e);
                      }
                    }}
                  >
                    Marcar revisado
                  </Button>
                </div>
              </>
            ) : (
              <span>Sin precio vigente informado.</span>
            )}
          </div>
        ))
      )}
      <p className="small muted">
        Se destaca el menor dentro de la misma moneda y tratamiento de IVA. Las
        referencias incompatibles se muestran por separado.
      </p>
    </Card>
  );
}
