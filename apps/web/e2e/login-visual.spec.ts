import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

test('login: marca, contraseña visible, Bloq Mayús y error real en escritorio y móvil', async ({
  page,
}) => {
  const output = resolve('docs/evidencia/login');
  await mkdir(output, { recursive: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [1440, 1024, 360]) {
    await page.setViewportSize({ width, height: width === 360 ? 740 : 1000 });
    await page.goto('/login');
    await expect(
      page.getByRole('heading', { name: 'Ingresá a tu cuenta', exact: true }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const email = page.getByLabel('Correo electrónico'),
      password = page.getByLabel('Contraseña');
    await expect(email).toBeFocused();
    await expect(
      page.getByRole('button', { name: 'Ingresar', exact: true }),
    ).toBeDisabled();
    const capture = async (state: string) => {
      if (width === 360) {
        expect(
          await page
            .locator('form')
            .evaluate((e) => e.getBoundingClientRect().bottom <= innerHeight),
        ).toBe(true);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollHeight <= innerHeight,
          ),
        ).toBe(true);
      }
      await page.screenshot({
        path: resolve(output, `despues-${state}-${width}.png`),
      });
    };
    await capture('vacio');
    await password.focus();
    const caps = async (enabled: boolean) =>
      password.evaluate((element, active) => {
        const event = new KeyboardEvent('keydown', { key: 'A', bubbles: true });
        Object.defineProperty(event, 'getModifierState', {
          value: (name: string) => name === 'CapsLock' && active,
        });
        element.dispatchEvent(event);
      }, enabled);
    // Headless OS keyboard state is not portable: dispatch only the modifier
    // event. Authentication and persistence below use the real API/PostgreSQL.
    await caps(true);
    await expect(
      page.getByText('Bloq Mayús está activado', { exact: true }),
    ).toBeVisible();
    await capture('bloq-mayus');
    await caps(false);
    await expect(
      page.getByText('Bloq Mayús está activado', { exact: true }),
    ).toHaveCount(0);
    await password.fill('Ejemplo-sin-cuenta-123!');
    await page.getByRole('button', { name: 'Mostrar', exact: true }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await expect(
      page.getByRole('button', { name: 'Ocultar', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await capture('visible');
    await page.getByRole('button', { name: 'Ocultar', exact: true }).click();
    await expect(password).toHaveAttribute('type', 'password');
    await email.fill('visual-login@example.test');
    const response = page.waitForResponse('**/api/v1/auth/login');
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    expect((await response).status()).toBe(401);
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'Correo o contraseña incorrectos.' }),
    ).toBeVisible();
    await capture('error');
  }
});
