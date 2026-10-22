'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api, fieldErrors } from '@/lib/api';
import { useAll, useMutation } from '@/lib/hooks';
import { formatQty, isPositiveDecimal, parseDecimalInput } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Button, Card, Confirm, DataTable, DecimalField, Empty, ErrorBox, Loading, Modal, Pill, SelectField, TextField, useToast } from '@/components/ui';
import { useSuppliers, type Presentation } from './common';

export function Presentations({ materialId, unitCode }: { materialId: string; unitCode: string }) {
  const { can } = useSession();
  const canEdit = can('editMaterials');
  const economic = can('readSuppliers');
  const toast = useToast();
  const list = useAll<Presentation>('/presentations', { materialId });
  const suppliers = useSuppliers(economic);
  const [creating, setCreating] = useState(false);
  const [toggle, setToggle] = useState<Presentation | null>(null);
  const tm = useMutation(async (_k, p: Presentation) => api.patch<{ data: Presentation }>(`/presentations/${p.id}`, { active: !p.active }));

  const rows = [...list.rows].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  return (
    <Card
      title="Presentaciones comerciales"
      actions={
        canEdit && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} /> Nueva presentación
          </Button>
        )
      }
    >
      <div className="note small" style={{ marginBottom: 10 }}>
        Cada presentación declara cuántas unidades base contiene (ej.: 1 Bolsa 50 kg = 50 {unitCode}). La equivalencia no se edita: para cambiarla, creá una presentación nueva y desactivá la anterior. Así no se alteran compras ni precios históricos.
      </div>
      {list.error ? (
        <ErrorBox error={list.error} onRetry={list.reload} />
      ) : list.loading ? (
        <Loading />
      ) : (
        <DataTable
          rows={rows}
          rowKey={(p) => p.id}
          empty={<Empty title="Sin presentaciones">El material se maneja sólo en su unidad base.</Empty>}
          columns={[
            { key: 'n', header: 'Presentación', render: (p) => <b>{p.name}</b> },
            { key: 'eq', header: 'Equivalencia', render: (p) => `1 ${p.name} = ${formatQty(p.baseQuantity, unitCode)}` },
            ...(economic ? [{ key: 's', header: 'Proveedor', render: (p: Presentation) => (p.supplierId ? (suppliers.map.get(p.supplierId)?.name ?? '…') : '—'), hideMobile: true }] : []),
            { key: 'st', header: 'Estado', render: (p) => (p.active ? <Pill tone="ok">Activa</Pill> : <Pill>Inactiva</Pill>) },
            ...(canEdit
              ? [
                  {
                    key: 'a',
                    header: '',
                    align: 'r' as const,
                    render: (p: Presentation) => (
                      <Button size="sm" variant="sec" onClick={() => setToggle(p)}>
                        {p.active ? 'Desactivar' : 'Activar'}
                      </Button>
                    ),
                  },
                ]
              : []),
          ]}
          mobile={(p) => (
            <div className="stack" style={{ gap: 6 }}>
              <div className="row">
                <b style={{ flex: 1 }}>{p.name}</b>
                {p.active ? <Pill tone="ok">Activa</Pill> : <Pill>Inactiva</Pill>}
              </div>
              <span className="small">1 {p.name} = {formatQty(p.baseQuantity, unitCode)}</span>
              {canEdit && (
                <Button size="lg" variant="sec" onClick={() => setToggle(p)}>
                  {p.active ? 'Desactivar' : 'Activar'}
                </Button>
              )}
            </div>
          )}
        />
      )}
      {creating && (
        <PresentationForm
          materialId={materialId}
          unitCode={unitCode}
          suppliers={economic ? suppliers.rows.filter((s) => s.active).map((s) => ({ value: s.id, label: s.name })) : null}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            list.reload();
          }}
        />
      )}
      <Confirm
        open={!!toggle}
        title={toggle?.active ? 'Desactivar presentación' : 'Activar presentación'}
        confirmLabel={toggle?.active ? 'Desactivar' : 'Activar'}
        tone={toggle?.active ? 'danger' : 'primary'}
        pending={tm.pending}
        error={tm.error}
        onClose={() => {
          setToggle(null);
          tm.reset();
        }}
        onConfirm={async () => {
          if (!toggle) return;
          const r = await tm.run(toggle);
          if (r) {
            toast.success(r.data.active ? 'Presentación activada' : 'Presentación desactivada');
            setToggle(null);
            list.reload();
          }
        }}
      >
        {toggle?.active
          ? `"${toggle?.name}" dejará de ofrecerse para nuevos precios y compras. El historial se conserva.`
          : `"${toggle?.name}" volverá a estar disponible (1 = ${formatQty(toggle?.baseQuantity, unitCode)}).`}
      </Confirm>
    </Card>
  );
}

function PresentationForm({
  materialId,
  unitCode,
  suppliers,
  onClose,
  onSaved,
}: {
  materialId: string;
  unitCode: string;
  suppliers: { value: string; label: string }[] | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState({ name: '', baseQuantity: '', supplierId: '' });
  const [local, setLocal] = useState<Record<string, string>>({});
  const m = useMutation(async (_k, body: Record<string, unknown>) => api.post<{ data: Presentation }>('/presentations', body));
  const errs = { ...fieldErrors(m.error), ...local };
  const bq = parseDecimalInput(f.baseQuantity);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const le: Record<string, string> = {};
    if (!f.name.trim()) le.name = 'Ingresá un nombre';
    if (!bq || !isPositiveDecimal(bq)) le.baseQuantity = `Ingresá cuántos ${unitCode} contiene (mayor a cero)`;
    setLocal(le);
    if (Object.keys(le).length) return;
    const body: Record<string, unknown> = { materialId, name: f.name.trim(), baseQuantity: bq };
    if (suppliers) body.supplierId = f.supplierId || null;
    const r = await m.run(body);
    if (r) {
      toast.success('Presentación creada correctamente');
      onSaved();
    }
  };
  return (
    <Modal
      open
      side
      title="Nueva presentación"
      onClose={m.pending ? () => {} : onClose}
      footer={
        <>
          <Button variant="sec" onClick={onClose} disabled={m.pending}>
            Cancelar
          </Button>
          <Button type="submit" form="pres-form" loading={m.pending}>
            Crear
          </Button>
        </>
      }
    >
      <form id="pres-form" className="stack" onSubmit={submit} noValidate>
        <TextField label="Nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={errs.name} placeholder="Ej.: Bolsa 50 kg" maxLength={500} />
        <DecimalField
          label={`Cantidad de unidad base (${unitCode}) por presentación`}
          value={f.baseQuantity}
          onChange={(e) => setF({ ...f, baseQuantity: e.target.value })}
          error={errs.baseQuantity}
          placeholder="Ej.: 50"
        />
        <div className="alert">
          <b>1 {f.name.trim() || 'presentación'} = {bq && isPositiveDecimal(bq) ? formatQty(bq, unitCode) : `? ${unitCode}`}</b>
          <div className="small">Verificá la equivalencia: no podrá modificarse después.</div>
        </div>
        {suppliers && <SelectField label="Proveedor (opcional)" value={f.supplierId} onChange={(e) => setF({ ...f, supplierId: e.target.value })} placeholder="Cualquiera" options={suppliers} />}
        <ErrorBox error={m.error && Object.keys(fieldErrors(m.error)).length === 0 ? m.error : null} />
      </form>
    </Modal>
  );
}
