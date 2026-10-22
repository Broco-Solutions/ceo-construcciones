// Presentación de unidades de medida. No convierte cantidades: sólo decide qué texto mostrar.
type UnitLike = { code: string; name: string; symbol?: string | null };

/** Código automático (UNI-001): identifica la unidad pero no le dice nada al usuario. */
const AUTO = /^UNI-\d+$/;

/** Abreviatura que acompaña a una cantidad: el símbolo (m², kg) o, en unidades previas sin símbolo, su código manual o su nombre. */
export function unitSymbol(u?: UnitLike | null): string {
  if (!u) return '';
  const s = u.symbol?.trim();
  if (s) return s;
  return AUTO.test(u.code) ? u.name : u.code;
}

/** Etiqueta para selectores y fichas: «Metro cuadrado (m²)». */
export function unitLabel(u?: UnitLike | null): string {
  if (!u) return '';
  const s = u.symbol?.trim() || (AUTO.test(u.code) ? '' : u.code);
  return s && s.toLowerCase() !== u.name.toLowerCase() ? `${u.name} (${s})` : u.name;
}
