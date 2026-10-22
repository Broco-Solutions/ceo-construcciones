'use client';
import { useEffect, useState } from 'react';
import { api, ApiError, type Schemas } from '@/lib/api';

type VersionMaterials = Schemas['VersionMaterials'];
export type PlannedRow = VersionMaterials['materialsByCategory'][number];

/**
 * Materiales previstos por el presupuesto de referencia de la obra, sin datos económicos:
 * GET /works/{id} → referenceVersionId → GET /budget-versions/{id}/materials (permitido también al Jefe de Obra).
 * Las etiquetas material/unit/category vienen incluidas en la respuesta; las cantidades son texto del servidor.
 */
export function usePlanned(workId: string | null) {
  const [data, setData] = useState<VersionMaterials | null>(null);
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  useEffect(() => {
    setData(null);
    setMissing(false);
    setError(null);
    if (!workId) return;
    const ctrl = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const w = await api.get<{ data: Schemas['WorkDetail'] }>(`/works/${workId}`, undefined, ctrl.signal);
        const ref = w.data.referenceVersionId;
        if (!ref) {
          setMissing(true);
          return;
        }
        const m = await api.get<{ data: VersionMaterials }>(`/budget-versions/${ref}/materials`, undefined, ctrl.signal);
        setData(m.data);
      } catch (e) {
        if ((e as Error)?.name !== 'AbortError') setError(e instanceof ApiError ? e : new ApiError(0, 'NETWORK', String(e)));
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [workId]);
  /** Filas previstas del rubro (una por material; cantidad tal como la informa el servidor). */
  const plannedRows = (categoryId: string): PlannedRow[] => data?.materialsByCategory.filter((m) => m.categoryId === categoryId) ?? [];
  /** Cantidad prevista para material+rubro; sin sumar en cliente. */
  const plannedFor = (materialId: string, categoryId: string) => {
    const rows = plannedRows(categoryId).filter((m) => m.materialId === materialId);
    return rows.length === 1 ? rows[0] : null;
  };
  const plannedIds = (categoryId: string) => new Set(plannedRows(categoryId).map((m) => m.materialId));
  return { data, loading, missing, error, plannedRows, plannedFor, plannedIds };
}
