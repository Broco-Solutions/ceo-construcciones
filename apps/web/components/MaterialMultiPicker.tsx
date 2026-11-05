'use client';
import { useState } from 'react';
import { EntityPicker } from './EntityPicker';
import { Button } from './ui';
import type { Schemas } from '@/lib/api';
import { unitSymbol } from '@/lib/units';
export function MaterialMultiPicker({
  existingIds,
  onAdd,
}: {
  existingIds: string[];
  onAdd: (rows: Schemas['Material'][]) => void;
}) {
  const [rows, setRows] = useState<Schemas['Material'][]>([]),
    [notice, setNotice] = useState('');
  return (
    <details className="material-multi">
      <summary>Agregar varios materiales</summary>
      <div className="stack">
        <EntityPicker<Schemas['Material']>
          resource="materials"
          label="Buscar materiales para agregar"
          value=""
          query={{ active: true }}
          onChange={(row) => {
            if (!row) return;
            if (
              existingIds.includes(row.id) ||
              rows.some((r) => r.id === row.id)
            ) {
              setNotice('El material ya está incluido. Editá su renglón.');
              return;
            }
            setNotice('');
            setRows((r) => [...r, row]);
          }}
        />
        {notice && (
          <p role="status" className="note">
            {notice}
          </p>
        )}
        <ul className="activity-review">
          {rows.map((r) => (
            <li key={r.id}>
              <span>
                <b>{r.name}</b>
                <small>
                  {r.code} · {unitSymbol(r.unit)}
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
        <Button
          disabled={!rows.length}
          onClick={() => {
            onAdd(rows);
            setRows([]);
          }}
        >
          Incorporar {rows.length} materiales al borrador
        </Button>
      </div>
    </details>
  );
}
