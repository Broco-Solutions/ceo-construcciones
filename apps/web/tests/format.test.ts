import { describe, expect, it } from 'vitest';
import { compareDecimal, formatDecimal, formatMoney, parseDecimalInput } from '@/lib/format';

describe('formatDecimal (sin pérdida de precisión)', () => {
  it('formatea con separadores argentinos sin pasar por Number', () => {
    expect(formatDecimal('1234567.50000000')).toBe('1.234.567,5');
    expect(formatDecimal('0.07000000')).toBe('0,07');
    expect(formatDecimal('12345678901234567890.12345678')).toBe('12.345.678.901.234.567.890,12345678');
    expect(formatDecimal('0.0000000000000001')).toBe('0,0000000000000001');
  });
  it('importes con dos decimales mínimos', () => {
    expect(formatMoney('10', 'ARS')).toBe('ARS 10,00');
    expect(formatMoney(null)).toBe('—');
  });
});

describe('parseDecimalInput', () => {
  it('acepta coma decimal y miles con punto', () => {
    expect(parseDecimalInput('4,5')).toBe('4.5');
    expect(parseDecimalInput('1.234,25')).toBe('1234.25');
    expect(parseDecimalInput('0.07')).toBe('0.07');
  });
  it('rechaza más de 8 decimales o texto', () => {
    expect(parseDecimalInput('1,123456789')).toBeNull();
    expect(parseDecimalInput('abc')).toBeNull();
    expect(parseDecimalInput('')).toBeNull();
  });
});

describe('compareDecimal', () => {
  it('compara como texto', () => {
    expect(compareDecimal('10.5', '9.99999999')).toBe(1);
    expect(compareDecimal('0.10', '0.1')).toBe(0);
    expect(compareDecimal('-1', '0')).toBe(-1);
  });
});
