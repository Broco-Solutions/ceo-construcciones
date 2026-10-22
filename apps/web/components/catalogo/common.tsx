'use client';
import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { api, type Schemas } from '@/lib/api';
import { useAll } from '@/lib/hooks';
import { Button, useToast } from '@/components/ui';

export type Material = Schemas['Material'];
export type Unit = Schemas['Unit'];
export type Category = Schemas['Category'];
export type Supplier = Schemas['Supplier'];
export type Presentation = Schemas['Presentation'];
export type MaterialPrice = Schemas['MaterialPrice'];
export type TaxBasis = Schemas['TaxBasis'];

export const TAX_BASIS_LABEL: Record<TaxBasis, string> = {
  UNSPECIFIED: 'Sin especificar',
  INCLUDED: 'IVA incluido',
  EXCLUDED: 'Sin IVA (neto)',
};

function byId<T extends { id: string }>(rows: T[]) {
  const m = new Map<string, T>();
  rows.forEach((r) => m.set(r.id, r));
  return m;
}

/** Catálogos base (lectura para todos los roles). */
export function useUnits() {
  const r = useAll<Unit>('/units');
  const map = useMemo(() => byId(r.rows), [r.rows]);
  return { ...r, map };
}
export function useCategories() {
  const r = useAll<Category>('/categories');
  const map = useMemo(() => byId(r.rows), [r.rows]);
  return { ...r, map };
}
/** Proveedores: sólo roles económicos. Pasar enabled=false para no llamar al endpoint. */
export function useSuppliers(enabled: boolean) {
  const r = useAll<Supplier>(enabled ? '/suppliers' : null);
  const map = useMemo(() => byId(r.rows), [r.rows]);
  return { ...r, map };
}

export function ExportButton({ path, label, fallbackName }: { path: string; label: string; fallbackName: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="sec"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const name = await api.download(path, undefined, fallbackName);
          toast.success('Planilla descargada', { description: name });
        } catch (e) {
          toast.failure('No se pudo descargar la planilla', e);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Download size={16} /> {label}
    </Button>
  );
}

/** Convierte "" a null para campos opcionales. */
export const orNull = (s: string) => (s.trim() ? s.trim() : null);

/** Valor con retardo (búsquedas enviadas al servidor sin una request por tecla). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
