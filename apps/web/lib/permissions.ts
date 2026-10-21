// Matriz funcional conservadora (docs/INTEGRACION-CLAUDE-CODE.md). El backend valida siempre; esto sólo guía la UI.
import type { Role } from './api';

export const ROLE_LABEL: Record<Role, string> = {
  GERENCIA: 'Gerencia',
  COMPRAS: 'Compras',
  COMPUTO: 'Cómputo y Presupuestos',
  JEFE_OBRA: 'Jefe de Obra',
};

const R = (...roles: Role[]) => roles;
export const PERMS = {
  adminUsers: R('GERENCIA'),
  manageWorks: R('GERENCIA'),
  manageLocations: R('GERENCIA'),
  editMaterials: R('GERENCIA', 'COMPRAS', 'COMPUTO'),
  readSuppliers: R('GERENCIA', 'COMPRAS', 'COMPUTO'),
  editSuppliers: R('GERENCIA', 'COMPRAS'),
  editCatalogBase: R('GERENCIA', 'COMPUTO'), // rubros, unidades
  readEconomic: R('GERENCIA', 'COMPRAS', 'COMPUTO'),
  editBudget: R('GERENCIA', 'COMPUTO'), // APU, cómputos, presupuestos
  selectReference: R('GERENCIA'),
  createRequest: R('GERENCIA', 'COMPRAS', 'JEFE_OBRA'),
  processPurchases: R('GERENCIA', 'COMPRAS'), // estado pedido, cotizar, OC, factura
  readOrders: R('GERENCIA', 'COMPRAS', 'COMPUTO', 'JEFE_OBRA'),
  receive: R('GERENCIA', 'COMPRAS', 'JEFE_OBRA'),
  manageStock: R('GERENCIA', 'COMPRAS'), // reservas, transferencias, mínimos
  consume: R('GERENCIA', 'COMPRAS', 'JEFE_OBRA'), // consumo/devolución
  adjustStock: R('GERENCIA'), // inicial, ajustes, importaciones, auditoría
  reports: R('GERENCIA', 'COMPRAS', 'COMPUTO', 'JEFE_OBRA'),
} satisfies Record<string, Role[]>;

export type Perm = keyof typeof PERMS;
export function can(role: Role | undefined, perm: Perm) {
  return !!role && (PERMS[perm] as Role[]).includes(role);
}
