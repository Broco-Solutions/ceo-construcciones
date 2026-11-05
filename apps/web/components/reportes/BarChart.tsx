'use client';
import { useId, useState } from 'react';
import { Button, Empty } from '@/components/ui';
/** Numerical conversion is only for SVG geometry; labels/export use exact server strings. */
export function BarChart({
  title,
  description,
  rows,
  format,
  onSelect,
}: {
  title: string;
  description: string;
  rows: { key: string; label: string; value: string }[];
  format: (value: string) => string;
  onSelect?: (key: string) => void;
}) {
  const id = useId(),
    [page, setPage] = useState(0),
    size = 8,
    pages = Math.max(1, Math.ceil(rows.length / size)),
    activePage = Math.min(page, pages - 1),
    visible = rows.slice(activePage * size, (activePage + 1) * size),
    maximum = Math.max(1, ...rows.map((r) => Math.abs(Number(r.value))));
  return (
    <section className="card report-chart">
      <div className="hd">
        <h3 id={id + '-title'}>{title}</h3>
      </div>
      <div className="bd">
        <p className="small muted" id={id + '-desc'}>
          {description}
        </p>
        {!rows.length ? (
          <Empty title="Sin datos comparables para este grupo" />
        ) : (
          <>
            <ul className="chart-bars">
              {visible.map((r) => (
                <li key={r.key}>
                  <div>
                    <span>{r.label}</span>
                    <b>{format(r.value)}</b>
                  </div>
                  <svg
                    role="img"
                    aria-label={`${r.label}: ${format(r.value)}`}
                    viewBox="0 0 560 10"
                    width="100%"
                    height="10"
                    preserveAspectRatio="none"
                  >
                    <rect
                      width="560"
                      height="10"
                      rx="4"
                      fill="var(--surface2)"
                    />
                    <rect
                      width={Math.max(
                        0,
                        (Math.abs(Number(r.value)) / maximum) * 560,
                      )}
                      height="10"
                      rx="4"
                      fill="var(--ceo)"
                    />
                  </svg>
                </li>
              ))}
            </ul>
            {pages > 1 && (
              <div className="row">
                <Button
                  size="sm"
                  variant="sec"
                  disabled={activePage === 0}
                  onClick={() => setPage(activePage - 1)}
                >
                  Anterior
                </Button>
                <span className="small">
                  {activePage + 1} / {pages} · {rows.length} categorías
                </span>
                <Button
                  size="sm"
                  variant="sec"
                  disabled={activePage === pages - 1}
                  onClick={() => setPage(activePage + 1)}
                >
                  Siguiente
                </Button>
              </div>
            )}
            <details>
              <summary>Datos y detalle de {title.toLowerCase()}</summary>
              <div className="chart-data">
                {rows.map((r) => (
                  <div key={r.key}>
                    <span>{r.label}</span>
                    <b>{format(r.value)}</b>
                    {onSelect && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onSelect(r.key)}
                      >
                        Ver detalle de {r.label}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
