// Formato argentino para presentación. Opera sobre el texto decimal sin pasar por Number.

/** "1234.50000000" -> "1.234,5" (sin redondear; maxFrac opcional sólo trunca para visualización compacta). */
export function formatDecimal(value: string | null | undefined, opts: { minFrac?: number; maxFrac?: number } = {}): string {
  if (value === null || value === undefined || value === '') return '—';
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value).trim());
  if (!m) return String(value);
  const [, sign, int, fracRaw = ''] = m;
  let frac = fracRaw.replace(/0+$/, '');
  if (opts.maxFrac !== undefined && frac.length > opts.maxFrac) frac = fracRaw.slice(0, opts.maxFrac).replace(/0+$/, '');
  const min = opts.minFrac ?? 0;
  if (frac.length < min) frac = frac.padEnd(min, '0');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${grouped}${frac ? `,${frac}` : ''}`;
}

export function formatQty(value: string | null | undefined, unit?: string | null) {
  const v = formatDecimal(value);
  return unit && v !== '—' ? `${v} ${unit}` : v;
}

export function formatMoney(value: string | null | undefined, currency?: string | null) {
  const v = formatDecimal(value, { minFrac: 2 });
  if (v === '—') return v;
  return currency ? `${currency} ${v}` : v;
}

/** Entrada del usuario ("4,5" / "1.234,5") -> "4.5" para la API; null si no es un decimal válido. */
export function parseDecimalInput(input: string): string | null {
  let s = input.trim().replace(/\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d{1,8})?$/.test(s)) return null;
  return s.replace(/^(-?)0+(?=\d)/, '$1');
}

/** "4.50000000" -> "4,5" para precargar inputs. */
export function decimalToInput(value: string | null | undefined) {
  if (!value) return '';
  return formatDecimal(value).replace(/\./g, '');
}

/** Compara decimales positivos como texto (sin Number). */
export function compareDecimal(a: string, b: string): number {
  const norm = (s: string) => {
    const [i, f = ''] = s.replace(/^-/, '').split('.');
    return [i.replace(/^0+/, '') || '0', f.replace(/0+$/, '')] as const;
  };
  const neg = (s: string) => s.startsWith('-') && /[1-9]/.test(s);
  if (neg(a) !== neg(b)) return neg(a) ? -1 : 1;
  const [ai, af] = norm(a);
  const [bi, bf] = norm(b);
  let r = ai.length !== bi.length ? ai.length - bi.length : ai.localeCompare(bi);
  if (r === 0) {
    const len = Math.max(af.length, bf.length);
    r = af.padEnd(len, '0').localeCompare(bf.padEnd(len, '0'));
  }
  r = Math.sign(r);
  return neg(a) ? -r : r;
}

export function isPositiveDecimal(s: string | null | undefined) {
  return !!s && compareDecimal(s, '0') > 0;
}

const dateFmt = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' });
const dateTimeFmt = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });

export function formatDate(iso: string | null | undefined) {
  return iso ? dateFmt.format(new Date(iso)) : '—';
}
export function formatDateTime(iso: string | null | undefined) {
  return iso ? dateTimeFmt.format(new Date(iso)) : '—';
}
/** Preserve source precision; a technical month timestamp is never a quoted day. */
export function formatReferenceDate(value: string | null | undefined, precision = 'DAY') {
  if (!value || precision === 'UNKNOWN') return 'Fecha desconocida';
  if (precision === 'MONTH') return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 7)}-01T12:00:00Z`));
  return value.slice(0, 10).split('-').reverse().join('/');
}
/** "2026-10-30" (input date) -> ISO al mediodía UTC para evitar corrimientos de día. */
export function dateInputToIso(d: string) {
  return d ? new Date(`${d}T12:00:00.000Z`).toISOString() : undefined;
}
/** A reference selected by calendar day is available from that day's start in Argentina. */
export function referenceDateInputToIso(d: string) {
  return d ? new Date(`${d}T00:00:00-03:00`).toISOString() : undefined;
}
export function isoToDateInput(iso: string | null | undefined) {
  return iso ? iso.slice(0, 10) : '';
}
