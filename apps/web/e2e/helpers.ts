import { expect, type Page } from '@playwright/test';

export type RoleKey = 'GERENCIA' | 'COMPRAS' | 'COMPUTO' | 'JEFE_OBRA';
export function creds(role: RoleKey) {
  const email = process.env[`E2E_${role}_EMAIL`];
  const password = process.env[`E2E_${role}_PASSWORD`];
  if (!email || !password) throw new Error(`Faltan E2E_${role}_EMAIL / E2E_${role}_PASSWORD (usuarios sintéticos locales)`);
  return { email, password };
}

export async function login(page: Page, role: RoleKey) {
  const { email, password } = creds(role);
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Ingresar', { timeout: 20_000 });
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

export const ORIGIN = { Origin: process.env.E2E_BASE_URL ?? 'http://localhost:3000' };
export const uid = () => Math.random().toString(36).slice(2, 8);
