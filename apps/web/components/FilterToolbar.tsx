"use client";
import { useId, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui";
/** Secondary filters stay mounted, so folding them never loses values or focus on retry. */
export function FilterToolbar({
  primary,
  children,
  activeCount = 0,
  onClear,
}: {
  primary: React.ReactNode;
  children?: React.ReactNode;
  activeCount?: number;
  onClear?: () => void;
}) {
  const id = useId(),
    [expanded, setExpanded] = useState(false);
  return (
    <div className="filters filter-toolbar">
      {primary}
      {children && (
        <>
          <button
            type="button"
            className="btn sec filter-toggle"
            aria-expanded={expanded}
            aria-controls={id}
            onClick={() => setExpanded((v) => !v)}
          >
            <SlidersHorizontal size={16} /> Filtros
            {activeCount ? ` · ${activeCount} activos` : ""}
          </button>
          <div
            id={id}
            className={`filter-secondary ${expanded ? "expanded" : ""}`}
          >
            {children}
          </div>
        </>
      )}
      {activeCount > 0 && (
        <>
          <span className="small muted filter-active" role="status">
            {activeCount} filtros activos
          </span>
          {onClear && (
            <Button size="sm" variant="ghost" onClick={onClear}>
              Limpiar filtros
            </Button>
          )}
        </>
      )}
    </div>
  );
}
