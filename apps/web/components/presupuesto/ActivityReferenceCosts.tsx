'use client';
import { useState } from 'react';
import { useApi, useAll, useMutation } from '@/lib/hooks';
import { api, type Schemas } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useNavigationBlocker } from '@/lib/navigation';
import {
  formatMoney,
  formatReferenceDate,
  formatQty,
  parseDecimalInput,
  decimalToInput,
} from '@/lib/format';
import {
  Button,
  Card,
  DecimalField,
  SelectField,
  TextField,
  ErrorBox,
  Loading,
  DefList,
} from '@/components/ui';
type Costing = Schemas['ActivityCostingContent'];
export function ActivityReferenceCosts({
  item,
  onChanged,
}: {
  item: Schemas['ApuDetail'];
  onChanged?: () => void;
}) {
  const { can } = useSession(),
    q = useApi<{ data: Schemas['ResolvedActivityCost'] | null }>(
      `/activity-costing/${item.id}`,
    );
  const [editing, setEditing] = useState(false);
  if (q.loading) return <Loading />;
  if (q.error)
    return q.error.status === 503 ? (
      <p className="note">
        Los costos de referencia todavía no están habilitados en este entorno.
      </p>
    ) : (
      <ErrorBox error={q.error} onRetry={q.reload} />
    );
  const resolved = q.data?.data;
  if (editing)
    return (
      <CostingForm
        item={item}
        initial={resolved ?? null}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          q.reload();
          onChanged?.();
        }}
      />
    );
  return (
    <Card
      title="Costos de referencia"
      actions={
        can('editBudget') ? (
          <Button variant="sec" size="sm" onClick={() => setEditing(true)}>
            Editar referencias y mano de obra
          </Button>
        ) : undefined
      }
    >
      {resolved ? (
        <div className="stack">
          <DefList
            items={[
              [
                'Materiales',
                resolved.content.materialsIncludedInDirect
                  ? 'Incluidos en el agregado histórico'
                  : resolved.materialCost !== null
                    ? formatMoney(
                        resolved.materialCost,
                        resolved.content.currency,
                      )
                    : 'Elegir referencia',
              ],
              [
                'Mano de obra',
                resolved.laborCost !== null
                  ? `${formatMoney(resolved.laborCost, resolved.content.currency)} · ${resolved.content.laborMode === 'CALCULATED' ? 'Calculada' : 'Directa'}`
                  : 'Sin tarifa',
              ],
              [
                'Otros costos directos',
                resolved.directCost === null
                  ? 'Pendiente'
                  : formatMoney(resolved.directCost, resolved.content.currency),
              ],
              [
                'Costo por unidad',
                resolved.totalUnitCost !== null
                  ? formatMoney(
                      resolved.totalUnitCost,
                      resolved.content.currency,
                    )
                  : 'Datos por revisar',
              ],
            ]}
          />
          {resolved.labor.map((l) => (
            <div className="note small" key={l.resourceId}>
              {l.name} · {formatQty(l.coefficient, l.unit)} ×{' '}
              {l.value === null
                ? 'Sin tarifa'
                : formatMoney(l.value, resolved.content.currency)}{' '}
              · {formatReferenceDate(l.dateLabel, l.datePrecision)} · {l.source}
            </div>
          ))}
          {resolved.content.notice && (
            <p className="note small">{resolved.content.notice}</p>
          )}
          {resolved.issues.map((issue) => (
            <p className="small muted" key={issue}>
              {issue}
            </p>
          ))}
        </div>
      ) : (
        <p>
          Mano de obra directa. Podés vincular referencias para calcular su
          costo sin sumar ambos importes.
        </p>
      )}
    </Card>
  );
}
function CostingForm({
  item,
  initial,
  onClose,
  onSaved,
}: {
  item: Schemas['ApuDetail'];
  initial: Schemas['ResolvedActivityCost'] | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const positive = (value: string | null | undefined) =>
    !!value && !/^0(?:\.0+)?$/.test(value);
  const valuationChanged =
    !!initial &&
    (positive(item.directCost) ||
      (initial.content.laborMode === 'DIRECT' && positive(item.laborCost))) &&
    (initial.content.currency !== item.laborCurrency ||
      initial.content.taxBasis !== item.laborTaxBasis);
  const selectedContent = initial
    ? {
        ...initial.content,
        labor: initial.content.labor.map((l) => ({
          ...l,
          rateId:
            initial.labor.find((r) => r.resourceId === l.resourceId)?.rateId ??
            l.rateId,
        })),
        materials: initial.content.materials.map((m) => ({
          ...m,
          priceId:
            initial.materials.find((r) => r.materialId === m.materialId)
              ?.sourcePriceId ?? m.priceId,
        })),
      }
    : undefined;
  const initialContent: Costing = valuationChanged
    ? {
        ...initial!.content,
        currency: item.laborCurrency ?? 'ARS',
        taxBasis: item.laborTaxBasis,
        laborMode: 'DIRECT',
        labor: [],
        materials: [],
      }
    : (selectedContent ?? {
        currency: item.laborCurrency ?? 'ARS',
        taxBasis: item.laborTaxBasis,
        laborMode: 'DIRECT',
        labor: [],
        materials: [],
        materialsIncludedInDirect: false,
        notice: '',
      });
  const [content, setContent] = useState<Costing>(initialContent),
    [preview, setPreview] = useState<{
      laborCost: string | null;
      materialCost: string | null;
      directCost: string | null;
      totalUnitCost: string | null;
    }>();
  const resources = useAll<Schemas['LaborResourceDetail']>('/labor-resources');
  const prices = useAll<Schemas['MaterialPrice']>('/prices');
  const save = useMutation(
    (_key: string, body: Schemas['ActivityCostingInput']) =>
      api.put(`/activity-costing/${item.id}`, body),
  );
  const calculate = useMutation((_key: string, body: Costing) =>
    api.post<{ data: NonNullable<typeof preview> }>(
      `/activity-costing/${item.id}/preview`,
      body,
    ),
  );
  function change(next: Costing) {
    setContent(next);
    setPreview(undefined);
  }
  async function persist() {
    if (!preview) return false;
    const result = await save.run({
      revision: initial?.revision ?? 0,
      content,
      ...(initial?.content.materialsIncludedInDirect &&
      !content.materialsIncludedInDirect
        ? { expectedDirectCost: item.directCost ?? null }
        : {}),
    });
    if (result) {
      onSaved();
      return true;
    }
    return false;
  }
  useNavigationBlocker({
    dirty: JSON.stringify(content) !== JSON.stringify(initialContent),
    save: persist,
    onPrompt: () => {},
  });
  return (
    <Card title="Composición del costo · referencias">
      <fieldset
        className="stack form-fields"
        disabled={save.pending || calculate.pending}
      >
        <p className="note">
          {valuationChanged
            ? 'La valoración de la actividad cambió: elegí referencias compatibles antes de guardar. '
            : ''}
          La MO calculada reemplaza el importe directo de mano de obra; nunca se
          suman ambos. Las cantidades y las revisiones emitidas se conservan.
        </p>
        <div className="formgrid">
          <SelectField
            label="Moneda de las referencias"
            value={content.currency}
            options={[
              { value: 'ARS', label: 'ARS' },
              { value: 'USD', label: 'USD' },
            ]}
            onChange={(e) =>
              change({
                ...content,
                currency: e.target.value,
                labor: [],
                materials: [],
              })
            }
          />
          <SelectField
            label="IVA informado de las referencias"
            value={content.taxBasis}
            options={[
              { value: 'UNSPECIFIED', label: 'No informado' },
              { value: 'EXCLUDED', label: 'Sin IVA' },
              { value: 'INCLUDED', label: 'IVA incluido' },
            ]}
            onChange={(e) =>
              change({
                ...content,
                taxBasis: e.target.value as Costing['taxBasis'],
                labor: [],
                materials: [],
              })
            }
          />
        </div>
        <p className="note small">
          Cambiar la valoración deja las referencias pendientes. No se
          convierten importes; Cancelar conserva la configuración anterior. Los
          importes directos deben coincidir con la valoración guardada en la
          actividad.
        </p>
        <SelectField
          label="Modalidad de mano de obra"
          value={content.laborMode}
          onChange={(e) =>
            change({
              ...content,
              laborMode: e.target.value as Costing['laborMode'],
              labor: [],
            })
          }
          options={[
            { value: 'DIRECT', label: 'Importe directo por actividad' },
            { value: 'CALCULATED', label: 'Calculada por composición' },
          ]}
        />
        {content.laborMode === 'DIRECT' ? (
          <p>
            Importe directo guardado: {item.laborCost ?? 'Sin importe'}. Se
            edita desde los datos de la actividad.
          </p>
        ) : (
          <>
            {content.labor.map((l, index) => {
              const resource = resources.rows.find(
                (r) => r.id === l.resourceId,
              );
              return (
                <div className="formgrid" key={index}>
                  <SelectField
                    label="Concepto de mano de obra"
                    value={l.resourceId}
                    placeholder="Elegir concepto"
                    options={resources.rows
                      .filter((r) => r.active)
                      .map((r) => ({
                        value: r.id,
                        label: `${r.name} · ${r.unit}`,
                      }))}
                    onChange={(e) =>
                      change({
                        ...content,
                        labor: content.labor.map((r, i) =>
                          i === index
                            ? { ...r, resourceId: e.target.value, rateId: '' }
                            : r,
                        ),
                      })
                    }
                  />
                  <SelectField
                    label="Tarifa seleccionada"
                    value={l.rateId}
                    placeholder="Elegir tarifa"
                    options={(resource?.rates ?? [])
                      .filter(
                        (r) =>
                          r.currency === content.currency &&
                          r.taxBasis === content.taxBasis &&
                          (!r.effectiveAt ||
                            new Date(r.effectiveAt) <= new Date()),
                      )
                      .map((r) => ({
                        value: r.id,
                        label: `${r.value} ${r.currency} · ${r.dateLabel ?? 'Fecha desconocida'} · ${r.source}`,
                      }))}
                    onChange={(e) =>
                      change({
                        ...content,
                        labor: content.labor.map((r, i) =>
                          i === index ? { ...r, rateId: e.target.value } : r,
                        ),
                      })
                    }
                  />
                  <DecimalField
                    label={`Consumo por unidad de actividad (${resource?.unit ?? 'unidad'})`}
                    value={decimalToInput(l.coefficient)}
                    onChange={(e) => {
                      const parsed = parseDecimalInput(e.target.value);
                      change({
                        ...content,
                        labor: content.labor.map((r, i) =>
                          i === index ? { ...r, coefficient: parsed ?? '' } : r,
                        ),
                      });
                    }}
                  />
                  <Button
                    variant="sec"
                    onClick={() =>
                      change({
                        ...content,
                        labor: content.labor.filter((_, i) => i !== index),
                      })
                    }
                  >
                    Quitar concepto
                  </Button>
                </div>
              );
            })}
            <Button
              variant="sec"
              onClick={() =>
                change({
                  ...content,
                  labor: [
                    ...content.labor,
                    { resourceId: '', rateId: '', coefficient: '' },
                  ],
                })
              }
            >
              Agregar concepto de mano de obra
            </Button>
          </>
        )}
        {content.materialsIncludedInDirect ? (
          <div className="stack">
            <p className="note">
              El suministro está incluido en un agregado histórico. No se
              agregan sus precios otra vez ni se retira el agregado sin una
              composición conciliada.
            </p>
            <Button
              variant="sec"
              onClick={() =>
                change({
                  ...content,
                  materialsIncludedInDirect: false,
                  materialReview: {
                    status: 'VERIFIED',
                    detail:
                      'Sustitución expresa del agregado completo por composición comprobada.',
                    evidence: '',
                  },
                })
              }
            >
              Sustituir agregado por composición comprobada
            </Button>
          </div>
        ) : (
          item.components.map((m) => (
            <SelectField
              key={m.materialId}
              label={`Referencia de ${m.material.name}`}
              value={
                content.materials.find((p) => p.materialId === m.materialId)
                  ?.priceId ?? ''
              }
              placeholder="Elegir referencia"
              options={prices.rows
                .filter(
                  (p) =>
                    p.materialId === m.materialId &&
                    p.currency === content.currency &&
                    p.taxBasis === content.taxBasis &&
                    new Date(p.effectiveAt) <= new Date(),
                )
                .map((p) => ({
                  value: p.id,
                  label: `${p.price} / ${p.baseQuantity} · ${p.source ?? 'Sin fuente'}`,
                }))}
              onChange={(e) =>
                change({
                  ...content,
                  materials: [
                    ...content.materials.filter(
                      (p) => p.materialId !== m.materialId,
                    ),
                    { materialId: m.materialId, priceId: e.target.value },
                  ],
                })
              }
            />
          ))
        )}
        {initial?.content.materialsIncludedInDirect &&
        !content.materialsIncludedInDirect ? (
          <>
            <p className="note">
              Se retirará íntegramente el agregado de{' '}
              {formatMoney(item.directCost, content.currency)}. No se inventa un
              ajuste residual; la composición debe cubrir todo su alcance.
              Cancelar conserva el agregado.
            </p>
            <TextField
              label="Evidencia de la composición y del alcance sustituido"
              value={content.materialReview?.evidence ?? ''}
              onChange={(e) =>
                change({
                  ...content,
                  materialReview: {
                    status: 'VERIFIED',
                    detail:
                      'Sustitución expresa del agregado completo por composición comprobada.',
                    evidence: e.target.value,
                  },
                })
              }
            />
          </>
        ) : null}
        {calculate.error && <ErrorBox error={calculate.error} />}{' '}
        {save.error && <ErrorBox error={save.error} />}
        {preview && (
          <p className="note">
            MO: {preview.laborCost ?? 'Pendiente'} · Materiales:{' '}
            {preview.materialCost ?? 'Pendiente'} · Directos:{' '}
            {preview.directCost} · Costo por unidad:{' '}
            {preview.totalUnitCost ?? 'Pendiente'} {content.currency}
          </p>
        )}
        <div className="row">
          <Button
            variant="sec"
            onClick={async () => {
              const result = await calculate.run(content);
              if (result) setPreview(result.data);
            }}
          >
            Revisar cambio
          </Button>
          <Button disabled={!preview || save.pending} onClick={persist}>
            Guardar composición
          </Button>
          <Button variant="sec" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </fieldset>
    </Card>
  );
}
