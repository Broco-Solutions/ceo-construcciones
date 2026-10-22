'use client';
import { useState } from 'react';
import { Star } from 'lucide-react';
import { api, type Schemas } from '@/lib/api';
import { useMutation } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Button, Confirm, useToast } from '@/components/ui';

/** Gerencia: marca una versión como referencia de la obra (no es aprobación económica). */
export function ReferenceButton({ version, onDone }: { version: Pick<Schemas['BudgetVersion'], 'id' | 'number' | 'status'>; onDone: () => void }) {
  const { can } = useSession();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const m = useMutation((_k: string) => api.post<{ data: Schemas['BudgetVersion'] }>(`/budget-versions/${version.id}/reference`));
  if (!can('selectReference') || version.status === 'REFERENCE') return null;
  return (
    <>
      <Button variant="sec" size="sm" onClick={() => (m.reset(), setOpen(true))}>
        <Star size={14} /> Marcar como referencia
      </Button>
      <Confirm
        open={open}
        title={`Marcar versión ${version.number} como referencia`}
        confirmLabel="Marcar como referencia"
        pending={m.pending}
        error={m.error}
        onClose={() => setOpen(false)}
        onConfirm={async () => {
          const r = await m.run();
          if (r) {
            setOpen(false);
            toast.success(`Versión ${version.number} marcada como referencia`);
            onDone();
          }
        }}
      >
        <p>
          Esta versión pasará a ser la <b>referencia</b> de la obra: sus materiales necesarios se usan en el seguimiento de materiales. Si había otra versión de
          referencia, deja de serlo.
        </p>
        <div className="alert warn small" style={{ marginTop: 10 }}>
          Marcar como referencia <b>no implica aprobación económica</b> ni validación del presupuesto por parte de CEO.
        </div>
      </Confirm>
    </>
  );
}
