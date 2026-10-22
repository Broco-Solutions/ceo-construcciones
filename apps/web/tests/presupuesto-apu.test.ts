import { describe, expect, it } from 'vitest';
import { LABOR_REQUIRED_MSG, parseLaborCost } from '@/components/presupuesto/validation';

describe('ApuForm: mano de obra obligatoria y explícita', () => {
  it('vacío no se convierte en 0: bloquea con mensaje', () => {
    expect(parseLaborCost('')).toEqual({ error: LABOR_REQUIRED_MSG });
    expect(parseLaborCost('   ')).toEqual({ error: LABOR_REQUIRED_MSG });
    expect(LABOR_REQUIRED_MSG).toBe('Ingresá el importe de mano de obra (puede ser 0).');
  });
  it('0 explícito se acepta', () => {
    expect(parseLaborCost('0')).toEqual({ value: '0' });
    expect(parseLaborCost('0,00')).toEqual({ value: '0.00' });
  });
  it('serializa decimal como string y rechaza inválidos/negativos', () => {
    expect(parseLaborCost('1.234,5')).toEqual({ value: '1234.5' });
    expect(parseLaborCost('abc').error).toBeTruthy();
    expect(parseLaborCost('-5').error).toBeTruthy();
  });
});
