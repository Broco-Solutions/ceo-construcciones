import { Pill } from '@/components/ui';
import type { Schemas } from '@/lib/api';

export const WORK_STATUS: Record<Schemas['WorkStatus'], { label: string; tone: 'ok' | 'warn' | 'plain' }> = {
  ACTIVE: { label: 'Activa', tone: 'ok' },
  PAUSED: { label: 'Pausada', tone: 'warn' },
  COMPLETED: { label: 'Finalizada', tone: 'plain' },
};
export const WORK_STATUS_OPTIONS = (Object.keys(WORK_STATUS) as Schemas['WorkStatus'][]).map((k) => ({ value: k, label: WORK_STATUS[k].label }));

export function WorkStatusPill({ status }: { status: Schemas['WorkStatus'] }) {
  const s = WORK_STATUS[status];
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

export const LOCATION_KIND: Record<Schemas['LocationKind'], string> = { WAREHOUSE: 'Galpón', YARD: 'Patio', WORK: 'Obra' };

export const REQUEST_STATUS: Record<Schemas['RequestStatus'], { label: string; tone: 'ok' | 'warn' | 'bad' | 'blue' | 'plain' }> = {
  DRAFT: { label: 'Borrador', tone: 'plain' },
  SUBMITTED: { label: 'Enviado', tone: 'blue' },
  PROCESSING: { label: 'En proceso', tone: 'warn' },
  COMPLETED: { label: 'Completado', tone: 'ok' },
  CANCELLED: { label: 'Cancelado', tone: 'bad' },
};
export const ORDER_STATUS: Record<Schemas['PurchaseOrderStatus'], { label: string; tone: 'ok' | 'warn' | 'bad' | 'blue' | 'plain' }> = {
  DRAFT: { label: 'Borrador', tone: 'plain' },
  ISSUED: { label: 'Emitida', tone: 'blue' },
  PARTIALLY_RECEIVED: { label: 'Recepción parcial', tone: 'warn' },
  RECEIVED: { label: 'Recibida', tone: 'ok' },
  CANCELLED: { label: 'Anulada', tone: 'bad' },
};
