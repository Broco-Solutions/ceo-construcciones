'use client';
import { unitSymbol } from '@/lib/units';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeftRight, HardHat, Undo2, PackagePlus, Scale } from 'lucide-react';
import { api, ApiError, type Page as PageOf, type Role, type Schemas } from '@/lib/api';
import { useAll, useApi, useMutation } from '@/lib/hooks';
import { formatQty, isPositiveDecimal, parseDecimalInput } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Button, Card, Confirm, DecimalField, ErrorBox, Loading, SelectField, TextArea, fieldErrors, useToast } from '@/components/ui';
import { MaterialPicker, type PickedMaterial } from '@/components/catalogo/MaterialPicker';
import { LocationSelect, MOVEMENT_LABEL, locLabel, movementLocLabel, useInvLookups } from './common';

type FormType = Schemas['MovementInput']['type'];
type Input = Schemas['MovementInput'];
type Detail = Schemas['MovementDetail'];

/** Tipos habilitados por rol según OpenAPI (POST /movements). */
const BY_ROLE: Record<Role, FormType[]> = {
  GERENCIA: ['TRANSFER', 'CONSUMPTION', 'RETURN', 'ADJUSTMENT', 'INITIAL'],
  COMPRAS: ['TRANSFER', 'CONSUMPTION', 'RETURN'],
  COMPUTO: [],
  JEFE_OBRA: ['CONSUMPTION', 'RETURN'],
};
const ICON = { TRANSFER: ArrowLeftRight, CONSUMPTION: HardHat, RETURN: Undo2, ADJUSTMENT: Scale, INITIAL: PackagePlus } as const;
const HELP: Record<FormType, string> = {
  TRANSFER: 'Confirmación efectiva: el origen baja y el destino sube en el mismo momento. Si elegís una reserva, se satisface sólo por la cantidad trasladada.',
  CONSUMPTION: 'Baja el stock físico de la obra por material usado.',
  RETURN: 'Devuelve material sobrante desde la obra al galpón o patio.',
  ADJUSTMENT: 'Corrección de recuento (sólo Gerencia). Requiere motivo; queda auditado.',
  INITIAL: 'Apertura única del material en la ubicación: sólo se permite si no hubo movimientos previos. Recuentos posteriores se registran como ajuste.',
};

export function MovementForm() {
  const { user } = useSession();
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const lk = useInvLookups();
  const allowed = user ? BY_ROLE[user.role] : [];
  const isJefe = user?.role === 'JEFE_OBRA';
  const qType = sp.get('type') as FormType | null;
  const [type, setType] = useState<FormType | ''>(qType && allowed.includes(qType) ? qType : allowed.length === 1 ? allowed[0] : '');
  const [f, setF] = useState({
    materialId: sp.get('materialId') ?? '',
    sourceId: sp.get('sourceId') ?? '',
    destinationId: sp.get('destinationId') ?? '',
    quantity: '',
    reservationId: '',
    categoryId: '',
    reason: '',
    direction: 'OUT' as 'IN' | 'OUT',
  });
  const [local, setLocal] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<Input | null>(null);
  const [picked, setPicked] = useState<PickedMaterial | null>(null);
  const [done, setDone] = useState<Detail | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    if (qType && allowed.includes(qType)) setType(qType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qType, user?.role]);

  const workLocs = lk.locations.filter((l) => l.kind === 'WORK');
  const depotKinds = ['WAREHOUSE', 'YARD'] as const;
  const sourceKinds = type === 'CONSUMPTION' || type === 'RETURN' ? (['WORK'] as const) : undefined;
  const destKinds = type === 'RETURN' ? depotKinds : undefined;
  const needsSource = type === 'TRANSFER' || type === 'CONSUMPTION' || type === 'RETURN' || (type === 'ADJUSTMENT' && f.direction === 'OUT');
  const needsDest = type === 'TRANSFER' || type === 'RETURN' || type === 'INITIAL' || (type === 'ADJUSTMENT' && f.direction === 'IN');
  const balanceLoc = needsSource ? f.sourceId : f.destinationId;

  const mat = lk.matById.get(f.materialId);
  const unit = unitSymbol((picked?.id === f.materialId ? picked.unit : undefined) ?? mat?.unit);
  const balLocKind = lk.locById.get(balanceLoc)?.kind;
  // El Jefe de Obra sólo consulta saldos de su obra; nunca de galpón/patio.
  const balAllowed = !!(f.materialId && balanceLoc) && (!isJefe || balLocKind === 'WORK');
  const depots = lk.locations.filter((l) => l.active && (l.kind === 'WAREHOUSE' || l.kind === 'YARD'));
  const bal = useApi<PageOf<Schemas['Stock']>>(balAllowed ? '/stock' : null, { materialId: f.materialId, locationId: balanceLoc });
  const balRow = bal.data?.data[0];
  const destLoc = lk.locById.get(f.destinationId);
  const srcLoc = lk.locById.get(f.sourceId);
  const workId = type === 'TRANSFER' ? destLoc?.workId ?? undefined : type === 'CONSUMPTION' || type === 'RETURN' ? srcLoc?.workId ?? undefined : undefined;

  const reservations = useAll<Schemas['Reservation']>(type === 'TRANSFER' && f.materialId && workId ? '/reservations' : null, { materialId: f.materialId, workId });
  const activeRes = reservations.rows.filter((r) => r.status === 'ACTIVE' && r.sourceId === f.sourceId);
  const cats = useAll<{ id: string; code: string; name: string }>(type === 'CONSUMPTION' ? '/categories' : null);

  const m = useMutation((key: string, body: Input) => api.post<{ data: Schemas['MovementWriteResult'] }>('/movements', body, { idempotencyKey: key }));
  const fe = { ...fieldErrors(m.error), ...local };

  const build = (): Input | null => {
    const errs: Record<string, string> = {};
    if (!type) errs.type = 'Elegí el tipo de movimiento.';
    if (!f.materialId) errs.materialId = 'Elegí un material.';
    const quantity = parseDecimalInput(f.quantity);
    if (!isPositiveDecimal(quantity)) errs.quantity = 'Ingresá una cantidad mayor a 0.';
    if (needsSource && !f.sourceId) errs.sourceId = 'Elegí el origen.';
    if (needsDest && !f.destinationId) errs.destinationId = 'Elegí el destino.';
    if (type === 'TRANSFER' && f.sourceId && f.sourceId === f.destinationId) errs.destinationId = 'El destino debe ser distinto del origen.';
    if (type === 'ADJUSTMENT' && !f.reason.trim()) errs.reason = 'El motivo es obligatorio.';
    setLocal(errs);
    if (Object.keys(errs).length || !type) return null;
    const body: Input = { type, materialId: f.materialId, quantity: quantity as string };
    if (needsSource) body.sourceId = f.sourceId;
    if (needsDest) body.destinationId = f.destinationId;
    if (workId) body.workId = workId;
    if (type === 'TRANSFER' && f.reservationId) body.reservationId = f.reservationId;
    if (type === 'CONSUMPTION' && f.categoryId) body.categoryId = f.categoryId;
    if (type === 'ADJUSTMENT') {
      body.direction = f.direction;
      body.reason = f.reason.trim();
    }
    return body;
  };

  const submit = async () => {
    if (!confirm) return;
    const r = await m.run(confirm);
    if (r) {
      toast.success('Movimiento registrado correctamente', { description: MOVEMENT_LABEL[confirm.type] });
      if (isJefe) {
        // Replay idempotente con DTO legado (sin actorName/source/destination): refrescar por GET sin repetir el POST.
        let detail: Detail | null = 'actorName' in r.data ? (r.data as Detail) : null;
        if (!detail) {
          try {
            const g = await api.get<PageOf<Detail>>('/movements', { materialId: r.data.materialId, locationId: r.data.sourceId ?? r.data.destinationId ?? undefined, pageSize: 50 });
            detail = g.data.find((x) => x.id === r.data.id) ?? null;
          } catch {
            detail = null;
          }
        }
        setDone(detail ?? ({ ...r.data, source: null, destination: null, actorName: '' } as Detail));
      }
      setConfirm(null);
      setF((s) => ({ ...s, quantity: '', reservationId: '', reason: '' }));
      bal.reload();
      reservations.reload();
      if (!isJefe) router.push('/stock/movimientos');
    } else {
      // Error de negocio (p. ej. 409 stock insuficiente): refrescar saldos visibles.
      bal.reload();
      reservations.reload();
    }
  };

  if (!user) return <Loading />;
  if (!allowed.length) return <div className="alert warn">Tu rol no registra movimientos de stock.</div>;
  if (lk.loading) return <Loading />;

  const conflict = m.error instanceof ApiError && m.error.status === 409;

  return (
    <div className="stack">
      <Card title="Tipo de movimiento">
        <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
          {allowed.map((t) => {
            const I = ICON[t as keyof typeof ICON];
            return (
              <Button
                key={t}
                size={isJefe ? 'lg' : 'md'}
                variant={type === t ? 'primary' : 'sec'}
                aria-pressed={type === t}
                style={isJefe ? { flex: '1 1 160px', minHeight: 64 } : undefined}
                onClick={() => {
                  setType(t);
                  setLocal({});
                  m.reset();
                }}
              >
                <I size={isJefe ? 22 : 16} /> {MOVEMENT_LABEL[t]}
              </Button>
            );
          })}
        </div>
        {fe.type && <p className="err small">{fe.type}</p>}
        {type && <p className="small muted" style={{ marginBottom: 0 }}>{HELP[type]}</p>}
      </Card>

      {type && (
        <Card title={MOVEMENT_LABEL[type]}>
          <div className="formgrid">
            <MaterialPicker
              value={f.materialId || null}
              onChange={(pm) => {
                setPicked(pm);
                set('materialId')(pm?.id ?? '');
              }}
              error={fe.materialId}
            />
            {type === 'ADJUSTMENT' && (
              <SelectField
                label="Sentido"
                value={f.direction}
                onChange={(e) => set('direction')(e.target.value)}
                options={[
                  { value: 'OUT', label: 'Baja (salida de stock)' },
                  { value: 'IN', label: 'Alta (ingreso de stock)' },
                ]}
              />
            )}
            {needsSource && (
              <LocationSelect
                label={type === 'CONSUMPTION' || type === 'RETURN' ? 'Obra (origen)' : type === 'ADJUSTMENT' ? 'Ubicación' : 'Origen'}
                value={f.sourceId}
                onChange={set('sourceId')}
                locations={lk.locations}
                kinds={sourceKinds ? [...sourceKinds] : undefined}
                error={fe.sourceId}
              />
            )}
            {needsDest && (
              <LocationSelect
                label={type === 'RETURN' ? 'Devolver a (galpón o patio)' : type === 'INITIAL' || type === 'ADJUSTMENT' ? 'Ubicación' : 'Destino'}
                value={f.destinationId}
                onChange={set('destinationId')}
                locations={lk.locations}
                kinds={destKinds ? [...destKinds] : undefined}
                error={fe.destinationId}
                hint={
                  type === 'RETURN' && depots.length === 0
                    ? 'No hay galpones ni patios activos para recibir la devolución. Avisá a Compras o Gerencia.'
                    : undefined
                }
              />
            )}
            <DecimalField label={`Cantidad${unit ? ` (${unit})` : ''}`} value={f.quantity} onChange={(e) => set('quantity')(e.target.value)} error={fe.quantity} style={isJefe ? { fontSize: 20, padding: 14 } : undefined} />
            {type === 'TRANSFER' && f.materialId && workId && (
              <SelectField
                label="Satisfacer reserva (opcional)"
                value={f.reservationId}
                onChange={(e) => set('reservationId')(e.target.value)}
                placeholder={reservations.loading ? 'Cargando…' : activeRes.length ? 'Sin reserva' : 'No hay reservas activas para este origen y obra'}
                error={fe.reservationId}
                options={activeRes.map((r) => ({ value: r.id, label: `Reservado ${formatQty(r.quantity, unit)} · transferido ${formatQty(r.fulfilledQuantity, unit)}` }))}
              />
            )}
            {type === 'CONSUMPTION' && cats.rows.length > 0 && (
              <SelectField label="Rubro (opcional)" value={f.categoryId} onChange={(e) => set('categoryId')(e.target.value)} placeholder="Sin rubro" options={cats.rows.map((c) => ({ value: c.id, label: c.name }))} hint="Sin rubro, el consumo sólo cuenta en el total de la obra." />
            )}
          </div>
          {type === 'ADJUSTMENT' && <TextArea label="Motivo" value={f.reason} onChange={(e) => set('reason')(e.target.value)} error={fe.reason} maxLength={500} rows={2} />}
          {type === 'CONSUMPTION' && workLocs.length === 0 && <div className="alert warn">No tenés obras asignadas con ubicación de stock.</div>}

          {balAllowed && (
            <div className="note" style={{ marginTop: 12 }}>
              {bal.loading ? (
                'Consultando saldo…'
              ) : balRow ? (
                <>
                  Saldo actual en {locLabel(lk.locById.get(balanceLoc))}: físico <b>{formatQty(balRow.physical, unit)}</b> · reservado {formatQty(balRow.reserved, unit)} · disponible{' '}
                  <b>{formatQty(balRow.available, unit)}</b>
                </>
              ) : (
                <>Sin saldo registrado en {locLabel(lk.locById.get(balanceLoc))}.</>
              )}
            </div>
          )}

          {m.error && !confirm && (
            <div style={{ marginTop: 12 }}>
              <ErrorBox error={m.error} />
              {conflict && <p className="small muted">Los saldos se actualizaron. Revisá la cantidad e intentá de nuevo.</p>}
            </div>
          )}

          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16, gap: 8 }}>
            <Link className="btn sec" href={isJefe ? '/stock' : '/stock/movimientos'}>
              Volver
            </Link>
            <Button
              size={isJefe ? 'lg' : 'md'}
              onClick={() => {
                // No se descarta la clave: si el cuerpo es el mismo (p. ej. tras error de red) se reutiliza; si cambia, useMutation genera otra.
                m.setError(null);
                setDone(null);
                const b = build();
                if (b) setConfirm(b);
              }}
            >
              Revisar y confirmar
            </Button>
          </div>
        </Card>
      )}

      {done && (
        <Card title="Movimiento registrado">
          <div className="stack" style={{ gap: 10 }} data-testid="movement-created" role="status">
            <div className="dl">
              <div><small>Tipo</small><span>{MOVEMENT_LABEL[done.type]}</span></div>
              <div><small>Material</small><span>{lk.matById.get(done.materialId)?.name ?? (picked?.id === done.materialId ? picked.name : '—')}</span></div>
              <div><small>Cantidad</small><span>{formatQty(done.quantity, unit)}</span></div>
              <div><small>Origen</small><span data-testid="movement-created-source">{movementLocLabel(done.source, done.sourceId)}</span></div>
              <div><small>Destino</small><span data-testid="movement-created-destination">{movementLocLabel(done.destination, done.destinationId)}</span></div>
              <div><small>Registrado por</small><span data-testid="movement-created-actor">{done.actorName || '—'}</span></div>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Link className="btn sec" href={`/stock/movimientos${done.workId ? `?workId=${done.workId}` : ''}`}>
                Ver historial de movimientos
              </Link>
              <Button variant="ghost" onClick={() => setDone(null)}>
                Registrar otro
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Confirm
        open={!!confirm}
        title={`Confirmar ${confirm ? MOVEMENT_LABEL[confirm.type].toLowerCase() : ''}`}
        confirmLabel="Confirmar movimiento"
        tone={confirm?.type === 'ADJUSTMENT' ? 'danger' : 'primary'}
        pending={m.pending}
        error={m.error}
        onConfirm={submit}
        onClose={() => {
          setConfirm(null);
        }}
      >
        {confirm && <Summary body={confirm} lk={lk} unit={unit} materialName={picked?.id === confirm.materialId ? `${picked.code} · ${picked.name}` : undefined} />}
      </Confirm>
    </div>
  );
}

function Summary({ body, lk, unit, materialName }: { body: Input; lk: ReturnType<typeof useInvLookups>; unit?: string; materialName?: string }) {
  const mat = lk.matById.get(body.materialId);
  const L = (id?: string) => (id ? locLabel(lk.locById.get(id)) : '—');
  const items = useMemo(() => {
    const out: [string, string][] = [
      ['Material', materialName ?? (mat ? `${mat.code} · ${mat.name}` : body.materialId)],
      ['Cantidad', formatQty(body.quantity, unit)],
    ];
    if (body.sourceId) out.push(['Origen', L(body.sourceId)]);
    if (body.destinationId) out.push(['Destino', L(body.destinationId)]);
    if (body.direction) out.push(['Sentido', body.direction === 'IN' ? 'Alta' : 'Baja']);
    if (body.reason) out.push(['Motivo', body.reason]);
    if (body.reservationId) out.push(['Reserva', 'Se satisface por la cantidad trasladada']);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body]);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="dl">
        {items.map(([k, v]) => (
          <div key={k}>
            <small>{k}</small>
            <span>{v}</span>
          </div>
        ))}
      </div>
      {body.type === 'TRANSFER' && <div className="note">Al confirmar, el origen baja y el destino sube inmediatamente. No hay paso de recepción posterior.</div>}
      {body.type === 'INITIAL' && <div className="note">La apertura es única por material y ubicación.</div>}
    </div>
  );
}
