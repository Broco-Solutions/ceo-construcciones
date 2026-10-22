import { describe, expect, it } from 'vitest';
import { materialBody } from '@/components/catalogo/MaterialForm';
import { priceBaseQuantity } from '@/components/catalogo/PriceForm';

const f = { code: ' CEM-9 ', name: 'Cemento', unitId: 'u1', categoryId: '', active: true };

describe('materialBody', () => {
  it('nunca envía unitId en edición (MaterialPatch lo rechaza 422)', () => {
    const b = materialBody(true, f, '0');
    expect(b).not.toHaveProperty('unitId');
    expect(b).toEqual({ code: 'CEM-9', name: 'Cemento', categoryId: null, active: true, minimum: '0' });
  });
  it('envía unitId al crear', () => {
    expect(materialBody(false, f, undefined)).toMatchObject({ unitId: 'u1' });
  });
});

describe('priceBaseQuantity', () => {
  it('sin presentación es "1" fijo', () => expect(priceBaseQuantity(null)).toBe('1'));
  it('con presentación usa la equivalencia exacta como texto', () => expect(priceBaseQuantity({ baseQuantity: '50.00000000' })).toBe('50.00000000'));
});
