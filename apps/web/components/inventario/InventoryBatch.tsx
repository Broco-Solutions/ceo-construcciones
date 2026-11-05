"use client";
import { useRef, useState } from "react";
import { api, type Schemas } from "@/lib/api";
import { useApi, useMutation } from "@/lib/hooks";
import { useNavigation, useNavigationBlocker } from "@/lib/navigation";
import { useSession } from "@/lib/session";
import { parseDecimalInput, formatQty } from "@/lib/format";
import { EntityPicker } from "@/components/EntityPicker";
import {
  Button,
  DecimalField,
  ErrorBox,
  Modal,
  SelectField,
  TextField,
  useToast,
} from "@/components/ui";
import { unitSymbol } from "@/lib/units";
type Material = Schemas["Material"];
type Row = {
  key: string;
  materialId: string;
  name: string;
  unit: string;
  unitId: string;
  unitName: string;
  locationId: string;
  locationLabel?: string;
  value: string;
  inherit: boolean;
  reservationId: string;
  categoryId: string;
};
type Seed = Record<string, any>;
export function BatchActions({
  selected = [],
  locationId = "",
  allowMovement = true,
  onSaved,
}: {
  selected?: Seed[];
  locationId?: string;
  allowMovement?: boolean;
  onSaved: () => void;
}) {
  const { can } = useSession(),
    toast = useToast();
  const [mode, setMode] = useState<"minimum" | "movement" | null>(null);
  const start = (kind: "minimum" | "movement") => {
    const maximum = kind === "minimum" ? 200 : 100;
    if (selected.length > maximum) {
      toast.warning("Acotá la selección", {
        description: `Este lote admite hasta ${maximum} filas. No se recortó ni aplicó ninguna.`,
      });
      return;
    }
    setMode(kind);
  };
  return (
    <>
      {can("manageStock") && (
        <Button size="sm" variant="sec" onClick={() => start("minimum")}>
          Configurar mínimos
        </Button>
      )}
      {allowMovement && can("consume") && (
        <Button size="sm" variant="sec" onClick={() => start("movement")}>
          Movimiento multilínea
        </Button>
      )}
      {mode && (
        <InventoryBatch
          mode={mode}
          selected={selected}
          initialLocation={locationId}
          onClose={() => setMode(null)}
          onSaved={() => {
            setMode(null);
            onSaved();
          }}
        />
      )}
    </>
  );
}
export function InventoryBatch({
  mode,
  selected = [],
  initialLocation = "",
  onClose,
  onSaved,
}: {
  mode: "minimum" | "movement";
  selected?: Seed[];
  initialLocation?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useSession(),
    toast = useToast(),
    navigation = useNavigation();
  const locations = [
    ...new Set(
      selected.flatMap((r) =>
        typeof r.locationId === "string" ? [r.locationId] : [],
      ),
    ),
  ];
  const [locationId, setLocationId] = useState(
      initialLocation || (locations.length === 1 ? locations[0] : ""),
    ),
    [destinationId, setDestinationId] = useState(""),
    [type, setType] = useState<Schemas["MovementInput"]["type"]>(
      user?.role === "JEFE_OBRA" ? "CONSUMPTION" : "TRANSFER",
    ),
    [direction, setDirection] = useState("IN"),
    [reason, setReason] = useState("");
  const [rows, setRows] = useState<Row[]>(() =>
    selected.map((r) => ({
      key: crypto.randomUUID(),
      materialId: r.materialId,
      name: r.material?.name ?? r.name,
      unit: unitSymbol(r.material?.unit ?? r.unit),
      unitId: r.material?.unitId ?? r.unitId ?? `material:${r.materialId}`,
      unitName: r.material?.unit?.name ?? r.unit?.name ?? r.material?.name ?? r.name,
      locationId: r.locationId,
      locationLabel: r.location?.name,
      value: "",
      inherit: false,
      reservationId: "",
      categoryId: "",
    })),
  );
  const currentLocation = useApi<{ data: Schemas["Location"] }>(
    locationId ? "/locations/" + locationId : null,
  );
  const destinationLocation = useApi<{ data: Schemas["Location"] }>(
    destinationId ? "/locations/" + destinationId : null,
  );
  const [plan, setPlan] = useState<
      Schemas["MinimumBatchPlan"] | Schemas["MovementBatchPlan"]
    >(),
    [reviewSignature, setReviewSignature] = useState(""),
    [reviewing, setReviewing] = useState(false),
    [error, setError] = useState<unknown>(),
    [discard, setDiscard] = useState(false),
    [common, setCommon] = useState<Record<string, string>>({});
  const signature = JSON.stringify({
      rows,
      locationId,
      destinationId,
      type,
      direction,
      reason,
    }),
    latest = useRef(signature);
  latest.current = signature;
  const route =
    mode === "minimum" ? "/stock-minimum-batches" : "/movement-batches";
  const apply = useMutation((key: string, body: unknown) =>
    api.post<{ data: Schemas["InventoryBatchResult"] }>(route, body, {
      idempotencyKey: key,
    }),
  );
  const pending = reviewing || apply.pending,
    dirty = rows.length > 0;
  useNavigationBlocker({
    dirty,
    save: async () => {
      toast.failure(
        "Revisá y confirmá el lote antes de salir",
        new Error(
          "Una navegación no ejecuta movimientos ni cambios de mínimos.",
        ),
      );
      return false;
    },
    onPrompt: () => {},
  });
  const change = (key: string, patch: Partial<Row>) => {
    setPlan(undefined);
    setRows((r) =>
      r.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  };
  function body() {
    if (mode === "minimum") {
      const changed = rows.filter((r) => r.inherit || r.value.trim() !== "");
      if (!changed.length)
        throw new Error(
          "Completá al menos un valor. Vacío conserva el mínimo actual.",
        );
      return {
        rows: changed.map((r) => {
          const minimum = r.inherit ? null : parseDecimalInput(r.value);
          if (
            !r.locationId ||
            (!r.inherit && (minimum === null || minimum.startsWith("-")))
          )
            throw new Error("Elegí ubicación y un mínimo válido por fila.");
          return {
            materialId: r.materialId,
            locationId: r.locationId,
            minimum,
          };
        }),
      };
    }
    if (!rows.length) throw new Error("Agregá al menos un material.");
    const input: Schemas["MovementBatchInput"] = {
      header: {
        type,
        ...(type === "INITIAL" || (type === "ADJUSTMENT" && direction === "IN")
          ? { destinationId: locationId }
          : { sourceId: locationId }),
        ...(["TRANSFER", "RETURN"].includes(type) ? { destinationId } : {}),
        ...(type === "ADJUSTMENT"
          ? { direction: direction as "IN" | "OUT", reason }
          : {}),
        ...(reason ? { reason } : {}),
      },
      rows: rows.map((r) => {
        const quantity = parseDecimalInput(r.value);
        if (!quantity || quantity === "0" || quantity.startsWith("-"))
          throw new Error("Todas las cantidades deben ser mayores que cero.");
        return {
          materialId: r.materialId,
          quantity,
          ...(r.reservationId ? { reservationId: r.reservationId } : {}),
          ...(r.categoryId ? { categoryId: r.categoryId } : {}),
        };
      }),
    };
    return input;
  }
  async function review() {
    if (pending) return;
    setError(undefined);
    apply.reset();
    setReviewing(true);
    const original = signature;
    try {
      const response = await api.post<{
        data: Schemas["MinimumBatchPlan"] | Schemas["MovementBatchPlan"];
      }>(route + "/preview", body());
      if (latest.current === original) {
        setPlan(response.data);
        setReviewSignature(original);
      }
    } catch (e) {
      setError(e);
    } finally {
      setReviewing(false);
    }
  }
  async function confirm() {
    if (!plan || reviewSignature !== latest.current) return;
    const response = await apply.run({ ...body(), planHash: plan.planHash });
    if (response) {
      toast.success(
        mode === "minimum" ? "Mínimos actualizados" : "Movimientos registrados",
        {
          description: `${response.data.count} registros · lote ${response.data.batchId.slice(0, 8)}`,
        },
      );
      onSaved();
    }
  }
  const types =
    user?.role === "GERENCIA"
      ? ["TRANSFER", "CONSUMPTION", "RETURN", "INITIAL", "ADJUSTMENT"]
      : user?.role === "JEFE_OBRA"
        ? ["CONSUMPTION", "RETURN"]
        : ["TRANSFER", "CONSUMPTION", "RETURN"];
  const labels: Record<string, string> = {
    TRANSFER: "Transferencia",
    CONSUMPTION: "Consumo",
    RETURN: "Devolución",
    INITIAL: "Stock inicial",
    ADJUSTMENT: "Ajuste",
  };
  const reservations = rows.some((r) => r.reservationId);
  return (
    <Modal
      open={!navigation.blocking}
      onClose={() => {
        if (pending) return;
        dirty ? setDiscard(true) : onClose();
      }}
      title={
        mode === "minimum"
          ? "Configurar mínimos por lote"
          : "Registrar movimiento multilínea"
      }
      wide
      footer={
        <>
          <Button
            variant="sec"
            disabled={pending}
            onClick={() => (dirty ? setDiscard(true) : onClose())}
          >
            Cancelar
          </Button>
          {!discard &&
            (plan && reviewSignature === signature ? (
              <>
                <Button variant="sec" disabled={pending} onClick={review}>
                  Revisar nuevamente
                </Button>
                <Button loading={apply.pending} onClick={confirm}>
                  Confirmar {plan.rows.length} filas
                </Button>
              </>
            ) : (
              <Button loading={reviewing} onClick={review}>
                Revisar lote
              </Button>
            ))}
        </>
      }
    >
      {discard ? (
        <div className="stack">
          <p>¿Descartar los valores ingresados? No se aplicó el lote.</p>
          <Button variant="danger" onClick={onClose}>
            Salir sin guardar
          </Button>
          <Button variant="sec" onClick={() => setDiscard(false)}>
            Seguir editando
          </Button>
        </div>
      ) : (
        <div className="stack">
          <div className="note">
            {mode === "minimum"
              ? "Vacío conserva el valor; 0 desactiva; heredar quita el mínimo propio. No modifica stock ni genera movimientos."
              : "Cada cantidad se revisa antes de confirmar. El lote completo se registra una sola vez; una fila inválida impide aplicar todas."}
          </div>
          {locations.length > 1 && mode === "movement" && (
            <p className="alert warn">
              La selección contiene distintos orígenes. Elegí explícitamente
              uno; se revisará la disponibilidad de cada material en ese origen.
            </p>
          )}
          <div className="formgrid">
            {mode === "movement" && (
              <SelectField
                label="Tipo de movimiento"
                value={type}
                options={types.map((t) => ({ value: t, label: labels[t] }))}
                onChange={(e) => {
                  setType(e.target.value as typeof type);
                  setPlan(undefined);
                  setDestinationId("");
                }}
              />
            )}
            <EntityPicker
              resource="locations"
              label={
                mode === "minimum"
                  ? "Ubicación para agregar materiales"
                  : type === "INITIAL" ||
                      (type === "ADJUSTMENT" && direction === "IN")
                    ? "Destino"
                    : "Origen"
              }
              value={locationId}
              query={{ active: true }}
              onChange={(r) => {
                setLocationId(r?.id ?? "");
                if (mode === "movement")
                  setRows((rows) =>
                    rows.map((r) => ({ ...r, reservationId: "" })),
                  );
                setPlan(undefined);
              }}
            />
            {mode === "movement" && ["TRANSFER", "RETURN"].includes(type) && (
              <EntityPicker
                resource="locations"
                label="Destino"
                value={destinationId}
                query={{ active: true }}
                onChange={(r) => {
                  setDestinationId(r?.id ?? "");
                  setRows((rows) =>
                    rows.map((r) => ({ ...r, reservationId: "" })),
                  );
                  setPlan(undefined);
                }}
              />
            )}
            {mode === "movement" && type === "ADJUSTMENT" && (
              <>
                <SelectField
                  label="Dirección"
                  value={direction}
                  onChange={(e) => {
                    setDirection(e.target.value);
                    setPlan(undefined);
                  }}
                  options={[
                    { value: "IN", label: "Ingreso" },
                    { value: "OUT", label: "Egreso" },
                  ]}
                />
                <TextField
                  label="Motivo"
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setPlan(undefined);
                  }}
                  required
                />
              </>
            )}
          </div>
          <EntityPicker<Material>
            resource="materials"
            label="Agregar material"
            value=""
            query={{ active: true }}
            onChange={(m) => {
              if (!m) return;
              if (rows.length >= (mode === "minimum" ? 200 : 100)) {
                setError(
                  new Error(
                    "Se alcanzó el límite del lote. Confirmá o acotá las filas antes de agregar más.",
                  ),
                );
                return;
              }
              if (mode === "minimum" && !locationId) {
                setError(
                  new Error(
                    "Elegí primero una ubicación para esta combinación.",
                  ),
                );
                return;
              }
              if (
                rows.some(
                  (r) =>
                    r.materialId === m.id &&
                    (mode === "movement" || r.locationId === locationId),
                )
              ) {
                setError(
                  new Error("El material ya está en la lista. Editá esa fila."),
                );
                return;
              }
              setPlan(undefined);
              setRows((r) => [
                ...r,
                {
                  key: crypto.randomUUID(),
                  materialId: m.id,
                  name: m.name,
                  unit: unitSymbol(m.unit),
                  unitId: m.unitId,
                  unitName: m.unit?.name ?? m.name,
                  locationId,
                  locationLabel:
                    currentLocation.data?.data.id === locationId
                      ? currentLocation.data?.data.name
                      : undefined,
                  value: "",
                  inherit: false,
                  reservationId: "",
                  categoryId: "",
                },
              ]);
            }}
          />
          {mode === "minimum" &&
            [...new Set(rows.map((r) => r.unitId))].map((unitId) => {
              const groupRow=rows.find((r) => r.unitId === unitId)!;
              const unit = `${groupRow.unit} · ${groupRow.unitName}`;
              return (
                <div key={unitId} className="row">
                  <DecimalField
                    label={`Valor común (${unit})`}
                    value={common[unitId] ?? ""}
                    onChange={(e) =>
                      setCommon({ ...common, [unitId]: e.target.value })
                    }
                  />
                  <Button
                    size="sm"
                    variant="sec"
                    onClick={() => {
                      if (!(common[unitId] ?? "").trim()) return;
                      setPlan(undefined);
                      setRows(
                        rows.map((r) =>
                          r.unitId === unitId
                            ? { ...r, value: common[unitId], inherit: false }
                            : r,
                        ),
                      );
                    }}
                  >
                    Aplicar a filas de {unit}
                  </Button>
                </div>
              );
            })}
          <div className="batch-lines">
            {rows.map((r, i) => (
              <div className="batch-line" key={r.key}>
                <div>
                  <b>
                    {i + 1}. {r.name}
                  </b>
                  <small className="muted">Unidad base: {r.unit}</small>
                </div>
                {mode === "minimum" && (
                  <EntityPicker
                    resource="locations"
                    label={`Ubicación fila ${i + 1}`}
                    value={r.locationId}
                    selectedLabel={r.locationLabel}
                    query={{ active: true }}
                    onChange={(l) =>
                      change(r.key, {
                        locationId: l?.id ?? "",
                        locationLabel: l?.name,
                      })
                    }
                  />
                )}
                <DecimalField
                  label={`${mode === "minimum" ? "Nuevo mínimo" : "Cantidad"} fila ${i + 1} (${r.unit})`}
                  value={r.value}
                  disabled={r.inherit || pending}
                  onChange={(e) => change(r.key, { value: e.target.value })}
                  hint={mode === "minimum" ? "Vacío: sin cambios" : undefined}
                />
                {mode === "minimum" ? (
                  <label className="row">
                    <input
                      type="checkbox"
                      checked={r.inherit}
                      disabled={pending}
                      onChange={(e) =>
                        change(r.key, { inherit: e.target.checked })
                      }
                    />
                    Heredar del material
                  </label>
                ) : (
                  <div className="formgrid">
                    {type === "TRANSFER" && (
                      <ReservationPicker
                        materialId={r.materialId}
                        sourceId={locationId}
                        destinationId={destinationId}
                        workId={
                          destinationLocation.data?.data.id === destinationId
                            ? destinationLocation.data?.data.workId
                            : undefined
                        }
                        value={r.reservationId}
                        onChange={(reservationId) =>
                          change(r.key, { reservationId })
                        }
                      />
                    )}
                    <EntityPicker
                      resource="categories"
                      label={`Rubro fila ${i + 1} (opcional)`}
                      value={r.categoryId}
                      onChange={(c) =>
                        change(r.key, { categoryId: c?.id ?? "" })
                      }
                    />
                  </div>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    setPlan(undefined);
                    setRows(rows.filter((x) => x.key !== r.key));
                  }}
                >
                  Quitar fila {i + 1}
                </Button>
              </div>
            ))}
          </div>
          {plan && reviewSignature === signature && (
            <section className="card">
              <div className="bd stack">
                <b>Revisión: {plan.rows.length} filas</b>
                {"created" in plan && (
                  <p>
                    {plan.created} altas · {plan.changed} cambios ·{" "}
                    {plan.unchanged} sin cambios
                  </p>
                )}
                {plan.rows.map((row: any, i) => (
                  <div key={i} className="batch-preview">
                    <b>{row.material}</b>
                    {mode === "minimum" ? (
                      <span>
                        {row.location} · General {row.general} · Propio{" "}
                        {row.own ?? "Heredado"} · Efectivo {row.effective} →{" "}
                        {row.nextEffective} ·{" "}
                        {row.source === "LOCATION"
                          ? "Propio"
                          : row.source === "MATERIAL"
                            ? "Heredado"
                            : "Sin mínimo"}
                      </span>
                    ) : (
                      <span>
                        Físico {row.physical} · Reservado {row.reserved} ·
                        Disponible {row.available} · Cantidad {row.quantity}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
          <ErrorBox error={error ?? apply.error} />
        </div>
      )}
    </Modal>
  );
}
function ReservationPicker({
  materialId,
  sourceId,
  destinationId,
  workId,
  value,
  onChange,
}: {
  materialId: string;
  sourceId: string;
  destinationId: string;
  workId?: string | null;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <EntityPicker
      resource="reservations"
      label="Reserva (opcional)"
      value={value}
      query={{
        materialId,
        sourceId,
        workId: workId ?? undefined,
        status: "ACTIVE",
      }}
      disabled={!sourceId || !destinationId || !workId}
      onChange={(r) => onChange(r?.id ?? "")}
      placeholder={workId ? "Sin reserva" : "El destino debe ser una obra"}
    />
  );
}
