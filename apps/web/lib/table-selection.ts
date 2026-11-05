"use client";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/notifications";
import { api, type Schemas } from "./api";
export type Collection = {
  resource: string;
  filters?: Record<string, string | number | boolean | null | undefined>;
  total?: number;
  reload?: () => void;
};
type Row = Record<string, unknown>;
type Snapshot = Schemas["SelectionSnapshot"];
export function useTableSelection(
  collection: Collection | undefined,
  visibleIds: string[],
) {
  const toast = useToast();
  const filters = Object.fromEntries(
      Object.entries(collection?.filters ?? {}).filter(
        ([, v]) => v !== null && v !== undefined && v !== "",
      ),
    ),
    context = JSON.stringify([collection?.resource, filters]);
  const current = useRef(context);
  current.current = context;
  const [saved, setSaved] = useState<{
      context: string;
      snapshot: Snapshot;
      ids: Set<string>;
      scope: string;
    }>(),
    [pending, setPending] = useState(false),
    [preview, setPreview] = useState<{ context: string; ids: Set<string> }>(),
    [error, setError] = useState<unknown>(),
    [message, setMessage] = useState("");
  const busy = useRef(false),
    prior = useRef(context);
  const active = saved?.context === context ? saved : undefined,
    ids = active?.ids ?? new Set<string>();
  useEffect(() => {
    if (prior.current !== context) {
      if (saved?.ids.size)
        setMessage(
          "La selección se limpió porque cambiaron los filtros o el contexto.",
        );
      setSaved(undefined);
      setError(undefined);
      prior.current = context;
    }
  }, [context]);
  async function select(target: string[] | undefined) {
    if (!collection || busy.current) return;
    busy.current = true;
    setPending(true);
    if (target) setPreview({ context, ids: new Set([...ids, ...target]) });
    setError(undefined);
    const original = context;
    try {
      const result = await api.post<{ data: Snapshot }>("/selections", {
        resource: collection.resource,
        filters,
        ids: target,
        expectedTotal: target ? undefined : collection.total,
        previousToken: target ? active?.snapshot.token : undefined,
      });
      if (current.current !== original) return;
      const frozen = result.data;
      const keys = frozen.rows.map((r) =>
        String(r.id ?? `${r.materialId}:${r.locationId}`),
      );
      setSaved({
        context,
        snapshot: frozen,
        ids: target ? new Set([...ids, ...target]) : new Set(keys),
        scope: target
          ? (active?.scope ?? "Filas elegidas")
          : "Resultados del filtro revisado",
      });
      setMessage("");
    } catch (e) {
      if (current.current === original) setError(e);
    } finally {
      busy.current = false;
      setPending(false);
      setPreview(undefined);
    }
  }
  const toggle = (id: string) => {
    if (ids.has(id)) {
      const next = new Set(ids);
      next.delete(id);
      if (active) setSaved({ ...active, ids: next });
    } else if (
      active?.snapshot.rows.some(
        (r) => String(r.id ?? `${r.materialId}:${r.locationId}`) === id,
      )
    )
      setSaved({ ...active, ids: new Set([...ids, id]) });
    else void select([id]);
  };
  const togglePage = () => {
    if (visibleIds.every((id) => ids.has(id))) {
      if (active)
        setSaved({
          ...active,
          ids: new Set([...ids].filter((id) => !visibleIds.includes(id))),
        });
    } else void select(visibleIds);
  };
  async function exportRows(selected: boolean) {
    if (!collection || busy.current) return;
    busy.current = true;
    setPending(true);
    setError(undefined);
    try {
      await api.download(
        "/selections/export",
        undefined,
        "CEO.xlsx",
        false,
        selected
          ? { token: active?.snapshot.token, ids: [...ids] }
          : { resource: collection.resource, filters },
      );
      toast.success("Planilla descargada", {
        description: selected
          ? `${ids.size} registros seleccionados`
          : "Todos los resultados del filtro",
      });
    } catch (e) {
      setError(e);
      toast.failure(
        collection.resource === "stock"
          ? "No se pudo descargar la planilla de stock"
          : "No se pudo descargar la planilla",
        e,
      );
    } finally {
      busy.current = false;
      setPending(false);
      setPreview(undefined);
    }
  }
  return {
    ids: preview?.context === context ? preview.ids : ids,
    pending,
    error,
    message,
    scope: pending ? "Revisando selección…" : active?.scope,
    rows: (active?.snapshot.rows ?? []).filter((r) =>
      ids.has(String(r.id ?? `${r.materialId}:${r.locationId}`)),
    ) as Row[],
    toggle,
    togglePage,
    selectAll: () => select(undefined),
    clear: () => {
      setSaved(undefined);
      setMessage("Selección limpiada.");
    },
    exportRows,
  };
}
