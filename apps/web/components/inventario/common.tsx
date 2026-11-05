'use client';
// Piezas compartidas del módulo Inventario (stock, movimientos, reservas, alertas, reportes).
import { Combobox } from '@/components/Combobox';
import { EntityPicker } from '@/components/EntityPicker';
import { unitSymbol } from '@/lib/units';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { Schemas } from '@/lib/api';
import { useAll } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Field } from '@/components/ui';
import { formatQty } from '@/lib/format';

export type Loc = Schemas['Location'];
export type Work = Schemas['Work'];
export type Mat = Schemas['Material'] & { unit?: { id: string; code: string; name: string }; category?: { id: string; code: string; name: string } | null };
export type MovementType = Schemas['MovementType'];

export const KIND_LABEL: Record<Loc['kind'], string> = { WAREHOUSE: 'Galpón', YARD: 'Patio', WORK: 'Obra' };

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  INITIAL: 'Stock inicial',
  RECEIPT: 'Recepción',
  TRANSFER: 'Transferencia',
  CONSUMPTION: 'Consumo en obra',
  RETURN: 'Devolución',
  ADJUSTMENT: 'Ajuste',
};

export const RESERVATION_LABEL: Record<Schemas['ReservationStatus'], { label: string; tone: 'ok' | 'warn' | 'bad' | 'blue' | 'plain' }> = {
  ACTIVE: { label: 'Activa', tone: 'blue' },
  FULFILLED: { label: 'Cumplida', tone: 'ok' },
  CANCELLED: { label: 'Cancelada', tone: 'plain' },
};

/** Catálogos de apoyo. El backend ya restringe ubicaciones/obras del Jefe de Obra a las asignadas. */
export function useInvLookups() {
  const locs = useAll<Loc>('/locations');
  const works = useAll<Work>('/works');
  const mats = useAll<Mat>('/materials');
  const locById = useMemo(() => new Map(locs.rows.map((l) => [l.id, l])), [locs.rows]);
  const workById = useMemo(() => new Map(works.rows.map((w) => [w.id, w])), [works.rows]);
  const matById = useMemo(() => new Map(mats.rows.map((m) => [m.id, m])), [mats.rows]);
  const locByWork = useMemo(() => new Map(locs.rows.filter((l) => l.workId).map((l) => [l.workId as string, l])), [locs.rows]);
  return {
    locations: locs.rows,
    works: works.rows,
    materials: mats.rows,
    locById,
    workById,
    matById,
    locByWork,
    loading: locs.loading || works.loading || mats.loading,
    error: locs.error ?? works.error ?? mats.error,
    reload: () => {
      locs.reload();
      works.reload();
      mats.reload();
    },
  };
}

export function locLabel(l?: Pick<Loc, 'name' | 'code'> & { kind?: Loc['kind'] }) {
  if (!l) return 'Ubicación sin acceso';
  return `${l.kind ? `${KIND_LABEL[l.kind]} · ` : ''}${l.name}`;
}

/** Selector de ubicación agrupado por tipo. */
export function LocationSelect({
  label,
  value,
  onChange,
  locations,
  kinds,
  placeholder = 'Seleccioná una ubicación',
  error,
  hint,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  locations: Loc[];
  kinds?: Loc['kind'][];
  placeholder?: string;
  error?: string;
  hint?: string;
  required?: boolean;
}) {
  return <Combobox label={label} value={value} onChange={row=>onChange(row?.value??'')} options={locations.filter(l=>!kinds||kinds.includes(l.kind)||l.id===value).map(l=>({value:l.id,label:l.name,description:KIND_LABEL[l.kind]+' · '+l.code,disabled:!l.active}))} placeholder={placeholder} error={error} hint={hint} required={required}/>;
}

/** Selector local de material con búsqueda por código/nombre (sin precios). */
export function MaterialSelect({
  label = 'Material',
  value,
  onChange,
  materials,
  error,
  placeholder = 'Seleccioná un material',
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  materials: Mat[];
  error?: string;
  placeholder?: string;
}) {
  return <EntityPicker resource="materials" label={label} value={value} onChange={row=>onChange(row?.id??'')} query={{active:true}} error={error} placeholder={placeholder}/>;
}

/** Pestañas de navegación interna del módulo. */
export function InvNav() {
  const pathname = usePathname();
  const { can } = useSession();
  const items = [
    { href: '/stock', label: 'Saldos' },
    { href: '/stock/movimientos', label: 'Movimientos' },
    ...(can('manageStock') ? [{ href: '/stock/reservas', label: 'Reservas' }] : []),
    { href: '/stock/alertas', label: 'Alertas de mínimos' },
  ];
  return (
    <nav className="tabs" style={{ padding: 0 }} aria-label="Secciones de inventario">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className="tab" aria-selected={pathname === i.href} style={{ textDecoration: 'none' }}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

/** Ubicación de un movimiento según el DTO (source/destination). null con id = obra ajena no visible. */
export function movementLocLabel(l: Schemas['LocationSummary'] | null | undefined, id: string | null | undefined) {
  if (l) return `${KIND_LABEL[l.kind]} · ${l.name} (${l.code})`;
  return id ? 'Ubicación no visible' : '—';
}

export const MIN_SOURCE_LABEL: Record<Schemas['MinimumSource'], { label: string; title: string }> = {
  LOCATION: { label: 'propio de la ubicación', title: 'Mínimo configurado en esta ubicación (un 0 desactiva el heredado).' },
  MATERIAL: { label: 'heredado del material', title: 'Mínimo general del material, heredado por esta ubicación.' },
  NONE: { label: 'sin mínimo', title: 'Ni la ubicación ni el material tienen mínimo.' },
};

/** Celda de mínimo con su origen. NONE se muestra como "Sin mínimo" sin cantidad. */
export function MinimumValue({ minimum, source, unit }: { minimum: string; source?: Schemas['MinimumSource']; unit?: string }) {
  if (source === 'NONE') return <span className="muted" data-minimum-source="NONE">Sin mínimo</span>;
  const s = source ? MIN_SOURCE_LABEL[source] : null;
  return (
    <span data-minimum-source={source} title={s?.title}>
      {formatQty(minimum, unit)}
      {s && <span className="small muted"> · {s.label}</span>}
    </span>
  );
}
