'use client';
import { useState } from 'react';
import type { Schemas } from '@/lib/api';
import { EntityPicker } from '@/components/EntityPicker';
import { Button, ErrorBox } from '@/components/ui';
import { unitSymbol } from '@/lib/units';
export function ActivityMultiPicker({
  existingIds,
  onAdd,
}: {
  existingIds: string[];
  onAdd: (rows: Schemas['ApuDetail'][]) => Promise<void> | void;
}) {
  const [rows, setRows] = useState<Schemas['ApuDetail'][]>([]),
    [repeat, setRepeat] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>();
  const duplicates = rows.filter((r) => existingIds.includes(r.id));
  return (
    <div className="stack">
      <EntityPicker<Schemas['ApuDetail']>
        resource="apu-items"
        label="Buscar actividad por ítem, descripción o código"
        query={{ active: true }}
        value=""
        onChange={(row) => {
          if (row && !rows.some((r) => r.id === row.id))
            setRows((r) => [...r, row]);
        }}
      />
      <p className="small muted">
        Elegí las actividades y revisá la lista antes de incorporarlas. Los
        renglones anteriores conservan sus cantidades y composición.
      </p>
      <ul className="activity-review">
        {rows.map((r) => (
          <li key={r.id}>
            <span>
              <b>{r.name}</b>
              <small>
                {r.code} · {r.category.name} · {unitSymbol(r.unit)}
                {existingIds.includes(r.id)
                  ? ' · Ya incluida en el borrador'
                  : ''}
              </small>
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRows(rows.filter((x) => x.id !== r.id))}
            >
              Quitar
            </Button>
          </li>
        ))}
      </ul>
      {duplicates.length > 0 && (
        <label className="row">
          <input
            type="checkbox"
            checked={repeat}
            onChange={(e) => setRepeat(e.target.checked)}
          />
          Incorporar expresamente otra línea de las actividades ya incluidas (
          {duplicates.length})
        </label>
      )}
      <ErrorBox error={error} />
      <Button
        disabled={!rows.length || (!!duplicates.length && !repeat)}
        loading={pending}
        onClick={async () => {
          if (pending) return;
          setPending(true);
          setError(undefined);
          try {
            await onAdd(rows);
            setRows([]);
          } catch (e) {
            setError(e);
          } finally {
            setPending(false);
          }
        }}
      >
        Incorporar {rows.length} actividades
      </Button>
    </div>
  );
}
