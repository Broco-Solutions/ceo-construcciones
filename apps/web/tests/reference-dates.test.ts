import { expect, it } from 'vitest';
import { referenceDateInputToIso, formatReferenceDate } from '../lib/format';
it('la referencia de un día empieza a medianoche argentina y no al mediodía UTC', () => {
  expect(referenceDateInputToIso('2026-11-03')).toBe(
    '2026-11-03T03:00:00.000Z',
  );
  expect(
    new Date(referenceDateInputToIso('2026-11-03')!).getTime(),
  ).toBeLessThan(new Date('2026-11-03T10:00:00Z').getTime());
  expect(referenceDateInputToIso('')).toBeUndefined();
});

it('conserva día, mes y desconocido al mostrar referencias', () => {
  expect(formatReferenceDate('2026-11-03', 'DAY')).toBe('03/11/2026');
  expect(formatReferenceDate('2025-06', 'MONTH')).toContain('junio');
  expect(formatReferenceDate('2026-11-03T03:00:00Z', 'UNKNOWN')).toBe(
    'Fecha desconocida',
  );
});
