import type { Tx } from "../core/db";
import { ApiError } from "../core/errors";

/**
 * Solo en alta: el frontend manda AUTO y el servidor reserva un codigo real.
 * Las importaciones y los consumidores existentes siguen pudiendo enviar codigos propios.
 */
export const AUTO_CODE = "AUTO" as const;
export type CodeEntity =
  | "works"
  | "clients"
  | "suppliers"
  | "categories"
  | "units"
  | "materials"
  | "locations"
  | "apu-items";

export const PREFIX: Record<CodeEntity, string> = {
  works: "OBR",
  clients: "CLI",
  suppliers: "PRV",
  categories: "RUB",
  units: "UNI",
  materials: "MAT",
  locations: "UBI",
  "apu-items": "APU",
};

export function numberedCode(prefix: string, value: number): string {
  return prefix + "-" + String(value).padStart(3, "0");
}

async function isTaken(
  tx: Tx,
  entity: CodeEntity,
  code: string,
): Promise<boolean> {
  switch (entity) {
    case "works":
      return !!(await tx.work.findUnique({
        where: { code },
        select: { id: true },
      }));
    case "clients":
      return !!(await tx.client.findUnique({
        where: { code },
        select: { id: true },
      }));
    case "suppliers":
      return !!(await tx.supplier.findUnique({
        where: { code },
        select: { id: true },
      }));
    case "categories":
      return !!(await tx.category.findUnique({
        where: { code },
        select: { id: true },
      }));
    case "units":
      return !!(await tx.unit.findUnique({
        where: { code },
        select: { id: true },
      }));
    case "materials":
      return !!(await tx.material.findUnique({
        where: { code },
        select: { id: true },
      }));
    case "locations":
      return !!(await tx.location.findUnique({
        where: { code },
        select: { id: true },
      }));
    case "apu-items":
      return !!(await tx.apuItem.findFirst({
        where: { code },
        select: { id: true },
      }));
  }
}

/**
 * Contador transaccional por entidad (fila bloqueada por UPDATE; isolation SERIALIZABLE).
 * Se incrementa en el mismo COMMIT que el registro. Las colisiones con codigos
 * importados despues de la migracion se saltean sin pisar historicos.
 */
export async function reserveAutoCode(
  tx: Tx,
  entity: CodeEntity,
): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const row = await tx.codeCounter.update({
      where: { entity },
      data: { lastValue: { increment: 1 } },
      select: { lastValue: true },
    });
    const candidate = numberedCode(PREFIX[entity], row.lastValue);
    if (!(await isTaken(tx, entity, candidate))) return candidate;
  }
  throw new ApiError(
    409,
    "AUTO_CODE_EXHAUSTED",
    "No se pudo asignar un codigo. Reintente.",
  );
}

/** Mantiene el codigo manual historico, o asigna uno automatico cuando la UI lo solicita. */
export async function codeForCreate(
  tx: Tx,
  entity: CodeEntity,
  code: string,
): Promise<string> {
  return code === AUTO_CODE ? reserveAutoCode(tx, entity) : code;
}
