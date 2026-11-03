'use client';
import { useEffect, useState } from 'react';
import { Button, ErrorBox, Loading, Modal, useToast } from '@/components/ui';
import { useAll, useApi, useMutation } from '@/lib/hooks';
import { api, type Schemas } from '@/lib/api';
export function DelegationsForm({
  user,
  onClose,
}: {
  user?: Schemas['User'];
  onClose: () => void;
}) {
  const current = useApi<{ data: { locationId: string }[] }>(
      user ? `/reception-delegations/${user.id}` : null,
    ),
    locations = useAll<Schemas['Location']>(user ? '/locations' : null),
    [selected, setSelected] = useState<string[]>([]),
    toast = useToast();
  useEffect(() => {
    if (current.data) setSelected(current.data.data.map((d) => d.locationId));
  }, [current.data]);
  const save = useMutation(() =>
    api.put(`/reception-delegations/${user!.id}`, { locationIds: selected }),
  );
  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title={`Recepciones de ${user?.name ?? ''}`}
    >
      <div className="stack">
        <p className="note small">
          La delegación permite confirmar entregas dirigidas a estas
          ubicaciones. Conserva las restricciones de precios, stock y
          administración.
        </p>
        {current.loading || locations.loading ? (
          <Loading />
        ) : (
          locations.rows
            .filter((l) => l.active)
            .map((l) => (
              <label className="row" key={l.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(l.id)}
                  onChange={(e) =>
                    setSelected((ids) =>
                      e.target.checked
                        ? [...ids, l.id]
                        : ids.filter((id) => id !== l.id),
                    )
                  }
                />
                {l.name}
              </label>
            ))
        )}
        <ErrorBox error={current.error ?? locations.error ?? save.error} />
        <Button
          loading={save.pending}
          onClick={async () => {
            if (await save.run()) {
              toast.success('Delegaciones guardadas');
              onClose();
            }
          }}
        >
          Guardar delegaciones
        </Button>
      </div>
    </Modal>
  );
}
