'use client';
import { unitSymbol } from '@/lib/units';
import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api, fieldErrors, type Schemas } from '@/lib/api';
import { useAll, useMutation } from '@/lib/hooks';
import { decimalToInput, parseDecimalInput } from '@/lib/format';
import {
  Button,
  Card,
  DecimalField,
  Empty,
  ErrorBox,
  Loading,
  SelectField,
  TextField,
  useToast,
} from '@/components/ui';
import { useWorks } from './common';

/** lineId: id de la línea existente (se envía en PATCH para conservar identidad); undefined en líneas nuevas. */
type Row = { key: number; lineId?: string; itemId: string; quantity: string };
let seq = 0;

/** Alta/edición de cómputo. En edición, PATCH reemplaza todas las líneas. */
export function ComputationForm({
  initial,
  defaultWorkId,
  onSaved,
  onCancel,
}: {
  initial?: Schemas['ComputationDetail'];
  defaultWorkId?: string;
  onSaved: (id: string) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const works = useWorks();
  const apus = useAll<Schemas['ApuDetail']>('/apu-items');
  const [workId, setWorkId] = useState(initial?.workId ?? defaultWorkId ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [rows, setRows] = useState<Row[]>(() =>
    (initial?.lines ?? []).map((l) => ({
      key: ++seq,
      lineId: l.id,
      itemId: l.itemId,
      quantity: decimalToInput(l.quantity),
    })),
  );
  const [catFilter, setCatFilter] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const save = useMutation((_k: string, body: Schemas['ComputationPatch']) =>
    initial
      ? api.patch<{ data: Schemas['ComputationWriteResult'] }>(
          `/computations/${initial.id}`,
          body,
        )
      : api.post<{ data: Schemas['ComputationWriteResult'] }>(
          '/computations',
          body,
        ),
  );
  const apuById = useMemo(
    () => new Map(apus.rows.map((a) => [a.id, a])),
    [apus.rows],
  );
  const categories = useMemo(() => {
    const m = new Map<string, Schemas['Category']>();
    apus.rows.forEach((a) => m.set(a.categoryId, a.category));
    return [...m.values()];
  }, [apus.rows]);

  if (works.loading || apus.loading) return <Loading />;
  if (works.error || apus.error)
    return (
      <ErrorBox
        error={works.error ?? apus.error}
        onRetry={() => (works.reload(), apus.reload())}
      />
    );

  // Agrupa las filas por rubro del APU elegido (filas sin ítem van al final).
  const groups = new Map<
    string,
    { name: string; rows: { r: Row; i: number }[] }
  >();
  rows.forEach((r, i) => {
    const a = apuById.get(r.itemId);
    const k = a?.categoryId ?? '_';
    const g = groups.get(k) ?? {
      name: a?.category.name ?? 'Sin ítem elegido',
      rows: [],
    };
    g.rows.push({ r, i });
    groups.set(k, g);
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!workId) er.workId = 'Elegí la obra.';
    if (!name.trim()) er.name = 'Ingresá un nombre.';
    if (!rows.length) er.lines = 'Agregá al menos un ítem.';
    const lines: Schemas['ComputationPatch']['lines'] = [];
    rows.forEach((r, i) => {
      if (!r.itemId) er[`lines.${i}.itemId`] = 'Elegí una actividad de obra.';
      const q = parseDecimalInput(r.quantity);
      if (!q || q === '0' || q.startsWith('-'))
        er[`lines.${i}.quantity`] = 'Cantidad mayor a 0.';
      // En edición se envía el id de las líneas existentes para conservar su identidad (incluso con APU repetidos).
      if (r.itemId && q)
        lines.push(
          initial && r.lineId
            ? { id: r.lineId, itemId: r.itemId, quantity: q }
            : { itemId: r.itemId, quantity: q },
        );
    });
    setErrs(er);
    if (Object.keys(er).length) return;
    const res = await save.run({ workId, name: name.trim(), lines });
    if (res) {
      toast.success(
        initial
          ? 'Los cambios del cómputo se guardaron'
          : 'Cómputo creado correctamente',
      );
      onSaved(res.data.id);
    }
  }
  const fe = { ...fieldErrors(save.error), ...errs };
  const options = apus.rows
    .filter(
      (a) =>
        (a.active && (!catFilter || a.categoryId === catFilter)) ||
        rows.some((r) => r.itemId === a.id),
    )
    .map((a) => ({
      value: a.id,
      label: `${a.category.name} · ${a.code ? `${a.code} ` : ''}${a.name} (${unitSymbol(a.unit)})`,
    }));

  return (
    <form onSubmit={submit} className="stack" noValidate>
      <Card title="Cómputo">
        <div className="formgrid">
          <SelectField
            label="Obra"
            value={workId}
            placeholder="Elegir obra…"
            options={works.rows.map((w) => ({
              value: w.id,
              label: `${w.code} · ${w.name}`,
            }))}
            onChange={(e) => setWorkId(e.target.value)}
            error={fe.workId}
            disabled={!!initial}
            hint={
              initial
                ? 'La obra no se cambia en un cómputo existente.'
                : undefined
            }
          />
          <TextField
            label="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={300}
            placeholder="Cómputo inicial"
            error={fe.name}
          />
        </div>
        {initial && (
          <div className="note small" style={{ marginTop: 10 }}>
            Al guardar se reemplazan todas las líneas del cómputo por las de
            esta pantalla. Las versiones de presupuesto ya creadas no cambian.
          </div>
        )}
      </Card>
      <Card
        title="Cantidades por actividad"
        actions={
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <SelectField
              label="Filtrar ítems por rubro"
              value={catFilter}
              placeholder="Todos"
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
              onChange={(e) => setCatFilter(e.target.value)}
            />
            <Button
              size="sm"
              variant="sec"
              onClick={() =>
                setRows((r) => [...r, { key: ++seq, itemId: '', quantity: '' }])
              }
              disabled={!apus.rows.length}
            >
              <Plus size={14} /> Agregar ítem
            </Button>
          </div>
        }
        bodyClass=""
      >
        {!apus.rows.length ? (
          <Empty title="No hay actividades de obra">
            Primero cargá una actividad desde Catálogos.
          </Empty>
        ) : rows.length === 0 ? (
          <Empty title="Sin ítems">
            Agregá los ítems de la obra con su cantidad medida.
          </Empty>
        ) : (
          [...groups.entries()].map(([k, g]) => (
            <div key={k} className="rubro open">
              <div className="row" style={{ padding: '10px 18px' }}>
                <b>{g.name}</b>
                <span className="small muted">· {g.rows.length} ítems</span>
              </div>
              <div className="items stack">
                {g.rows.map(({ r, i }) => {
                  const a = apuById.get(r.itemId);
                  return (
                    <div
                      key={r.key}
                      className="formgrid"
                      style={{ alignItems: 'end' }}
                    >
                      <SelectField
                        label="Actividad de obra"
                        value={r.itemId}
                        placeholder="Elegir ítem…"
                        options={options}
                        onChange={(e) =>
                          setRows((rs) =>
                            rs.map((x) =>
                              x.key === r.key
                                ? { ...x, itemId: e.target.value }
                                : x,
                            ),
                          )
                        }
                        error={fe[`lines.${i}.itemId`]}
                      />
                      <DecimalField
                        label={`Cantidad${a ? ` (${unitSymbol(a.unit)})` : ''}`}
                        value={r.quantity}
                        placeholder="120,5"
                        onChange={(e) =>
                          setRows((rs) =>
                            rs.map((x) =>
                              x.key === r.key
                                ? { ...x, quantity: e.target.value }
                                : x,
                            ),
                          )
                        }
                        error={fe[`lines.${i}.quantity`]}
                      />
                      <div className="field">
                        <Button
                          variant="ghost"
                          onClick={() =>
                            setRows((rs) => rs.filter((x) => x.key !== r.key))
                          }
                          aria-label="Quitar ítem"
                        >
                          <Trash2 size={14} /> Quitar
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
        {fe.lines && (
          <div className="alert bad" style={{ margin: 12 }}>
            {fe.lines}
          </div>
        )}
      </Card>
      <ErrorBox error={save.error} />
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <Button
          variant="sec"
          size="lg"
          onClick={onCancel}
          disabled={save.pending}
        >
          Cancelar
        </Button>
        <Button type="submit" size="lg" loading={save.pending}>
          {initial ? 'Guardar cómputo' : 'Crear cómputo'}
        </Button>
      </div>
    </form>
  );
}
