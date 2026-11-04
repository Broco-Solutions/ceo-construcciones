// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TextField } from '@/components/ui';
import LoginPage from '@/app/login/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/session', () => ({
  useSession: () => ({ user: null, setUser: vi.fn() }),
}));
vi.mock('next/image', () => ({
  default: ({
    priority: _priority,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => (
    <img {...props} />
  ),
}));
vi.stubGlobal('React', React);
afterEach(cleanup);

it('TextField conserva estructura sin suffix y asociación de label cuando incluye un control', () => {
  const { rerender } = render(
    <TextField label="Dato" autoComplete="username" />,
  );
  const input = screen.getByLabelText('Dato');
  expect(input.parentElement?.className).toBe('field');
  expect(input.getAttribute('autocomplete')).toBe('username');
  rerender(
    <TextField
      label="Dato"
      id="dato"
      suffix={
        <button type="button" aria-controls="dato">
          Acción
        </button>
      }
    />,
  );
  expect(screen.getByLabelText('Dato').id).toBe('dato');
  expect(screen.getByRole('button').getAttribute('aria-controls')).toBe('dato');
  rerender(<TextField label="Dato" suffix={0} />);
  expect(screen.getByText('0')).toBeTruthy();
});

it('mostrar/ocultar conserva el valor y los labels/autocomplete del login', () => {
  render(<LoginPage />);
  const password = screen.getByLabelText('Contraseña') as HTMLInputElement;
  expect(document.activeElement).toBe(
    screen.getByLabelText('Correo electrónico'),
  );
  expect(password.getAttribute('autocomplete')).toBe('current-password');
  fireEvent.change(password, { target: { value: 'Ejemplo-sin-cuenta-123!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }));
  expect(password.type).toBe('text');
  expect(password.value).toBe('Ejemplo-sin-cuenta-123!');
  expect(
    screen
      .getByRole('button', { name: 'Ocultar' })
      .getAttribute('aria-pressed'),
  ).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Ocultar' }));
  expect(password.type).toBe('password');
  expect(password.value).toBe('Ejemplo-sin-cuenta-123!');
});

it('aviso de Bloq Mayús sigue keydown/keyup y se limpia al salir del campo', () => {
  render(<LoginPage />);
  const password = screen.getByLabelText('Contraseña');
  const key = (type: string, enabled: boolean) => {
    const event = new KeyboardEvent(type, { key: 'A', bubbles: true });
    Object.defineProperty(event, 'getModifierState', {
      value: (modifier: string) => modifier === 'CapsLock' && enabled,
    });
    fireEvent(password, event);
  };
  key('keydown', true);
  expect(
    screen
      .getByText('Bloq Mayús está activado')
      .parentElement?.getAttribute('aria-live'),
  ).toBe('polite');
  key('keyup', false);
  expect(screen.queryByText('Bloq Mayús está activado')).toBeNull();
  key('keyup', true);
  expect(screen.getByText('Bloq Mayús está activado')).toBeTruthy();
  fireEvent.blur(password);
  expect(screen.queryByText('Bloq Mayús está activado')).toBeNull();
});
