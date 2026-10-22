import { parseDecimalInput } from '@/lib/format';

export const LABOR_REQUIRED_MSG = 'Ingresá el importe de mano de obra (puede ser 0).';
export const LABOR_INVALID_MSG = 'Importe inválido (usá coma decimal).';

/**
 * Mano de obra del APU: obligatoria y explícita. Vacío NO se convierte en "0";
 * un 0 sólo se acepta si el usuario lo ingresó. Devuelve el decimal serializado o el error.
 */
export function parseLaborCost(input: string): { value: string; error?: undefined } | { value?: undefined; error: string } {
  if (!input.trim()) return { error: LABOR_REQUIRED_MSG };
  const v = parseDecimalInput(input);
  if (v === null || v.startsWith('-')) return { error: LABOR_INVALID_MSG };
  return { value: v };
}
