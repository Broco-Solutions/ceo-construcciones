import { describe, expect, it } from 'vitest';
import { can } from '@/lib/permissions';
import { NAV } from '@/lib/nav';

describe('matriz de permisos UI', () => {
  it('Jefe de Obra no accede a información económica', () => {
    for (const p of ['readEconomic', 'readSuppliers', 'editBudget', 'processPurchases', 'manageStock', 'adminUsers'] as const) expect(can('JEFE_OBRA', p)).toBe(false);
    for (const p of ['createRequest', 'receive', 'consume', 'reports'] as const) expect(can('JEFE_OBRA', p)).toBe(true);
  });
  it('navegación de Jefe excluye módulos económicos', () => {
    const visible = NAV.flatMap((g) => g.items).filter((i) => !i.perm || can('JEFE_OBRA', i.perm)).map((i) => i.href);
    expect(visible).not.toContain('/apu');
    expect(visible).not.toContain('/proveedores');
    expect(visible).not.toContain('/cotizaciones');
    expect(visible).toContain('/pedidos');
  });
  it('sólo Gerencia selecciona referencia y administra', () => {
    expect(can('GERENCIA', 'selectReference')).toBe(true);
    expect(can('COMPUTO', 'selectReference')).toBe(false);
    expect(can('COMPRAS', 'adminUsers')).toBe(false);
  });
});
