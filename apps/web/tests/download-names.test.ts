import { describe, expect, it } from 'vitest';
import { downloadDateAR, exportFilename, templateFilename } from '../lib/download-names';

describe('nombres de descargas en español y fecha argentina', () => {
  const date = new Date('2026-10-22T12:15:00.000Z');

  it('nombra las exportaciones Excel en español con YYYY-MM-DD sin hora', () => {
    expect(exportFilename('/exports/suppliers', date)).toBe('proveedores-2026-10-22.xlsx');
    expect(exportFilename('/exports/works', date)).toBe('obras-2026-10-22.xlsx');
    expect(exportFilename('/exports/materials', date)).toBe('materiales-2026-10-22.xlsx');
    expect(exportFilename('/exports/prices', date)).toBe('precios-2026-10-22.xlsx');
    expect(exportFilename('/exports/stock', date)).toBe('stock-2026-10-22.xlsx');
    expect(exportFilename('/exports/purchase-orders', date)).toBe('ordenes-de-compra-2026-10-22.xlsx');
  });

  it('traduce también las plantillas CSV', () => {
    expect(templateFilename('suppliers', date)).toBe('plantilla-proveedores-2026-10-22.csv');
    expect(templateFilename('purchase-orders', date)).toBe('plantilla-ordenes-de-compra-2026-10-22.csv');
    expect(templateFilename('initial-stock', date)).toBe('plantilla-stock-inicial-2026-10-22.csv');
  });

  it('usa la fecha local de Buenos Aires, no el día UTC', () => {
    expect(downloadDateAR(new Date('2026-10-23T02:59:00Z'))).toBe('2026-10-22');
    expect(downloadDateAR(new Date('2026-10-23T03:00:00Z'))).toBe('2026-10-23');
  });

  it('rechaza tipos no soportados', () => {
    expect(() => exportFilename('/exports/unknown', date)).toThrow('Exportación no reconocida');
    expect(() => templateFilename('unknown', date)).toThrow('Plantilla no reconocida');
  });
});
