'use client';
import { useEffect, useState } from 'react';
import { api, type Page, type Schemas } from '@/lib/api';

type VersionMaterials = Schemas['VersionMaterials'];

/**
 * Materiales previstos por el presupuesto de referencia de la obra.
 * La API no expone la versión de referencia sin endpoints económicos (/budgets), así que sólo se
 * resuelve para roles con lectura económica. Jefe de Obra ve lo previsto en el detalle (/requests/{id}/needs).
 */
export function usePlanned(workId: string | null, enabled: boolean) {
  const [data, setData] = useState<VersionMaterials | null>(null);
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    setData(null);
    setMissing(false);
    if (!workId || !enabled) return;
    let off = false;
    setLoading(true);
    (async () => {
      try {
        const budgets = await api.get<Page<Schemas['Budget']>>('/budgets', { workId, pageSize: 100 });
        for (const b of budgets.data) {
          const det = await api.get<{ data: Schemas['BudgetDetail'] }>(`/budgets/${b.id}`);
          const ref = det.data.versions.find((v) => v.status === 'REFERENCE');
          if (ref) {
            const m = await api.get<{ data: VersionMaterials }>(`/budget-versions/${ref.id}/materials`);
            if (!off) setData(m.data);
            return;
          }
        }
        if (!off) setMissing(true);
      } catch {
        if (!off) setMissing(true);
      } finally {
        if (!off) setLoading(false);
      }
    })();
    return () => {
      off = true;
    };
  }, [workId, enabled]);
  /** Cantidad prevista (texto del backend) para material+rubro; sin sumar en cliente. */
  const plannedFor = (materialId: string, categoryId: string) => {
    if (!data) return null;
    const byCat = data.materialsByCategory.filter((m) => m.materialId === materialId && m.categoryId === categoryId);
    return byCat.length === 1 ? byCat[0].quantity : null;
  };
  const plannedIds = (categoryId: string) => new Set(data?.materialsByCategory.filter((m) => m.categoryId === categoryId).map((m) => m.materialId) ?? []);
  return { data, loading, missing, plannedFor, plannedIds };
}
