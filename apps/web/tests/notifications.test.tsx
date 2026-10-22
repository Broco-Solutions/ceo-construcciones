// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Los componentes usan JSX sin import explícito de React (runtime clásico en vitest).
vi.hoisted(async () => {
  (globalThis as { React?: unknown }).React = (await import('react')).default;
});
import { ApiError } from '@/lib/api';
import { useMutation } from '@/lib/hooks';
import { MAX_NOTICES, NOTICE_DURATION, ToastProvider, useToast, type Notify } from '@/components/notifications';

let notify: Notify;
function Capture() {
  notify = useToast();
  return null;
}
const mount = () => render(<ToastProvider><Capture /></ToastProvider>);
const items = () => Array.from(document.querySelectorAll('.toast'));
const live = () => items().filter((n) => !n.classList.contains('leaving'));
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Notificaciones', () => {
  it('éxito: se anuncia en la región de estado, con botón para cerrar, y se va sola', () => {
    mount();
    act(() => void notify.success('Unidad creada correctamente'));
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toContain('Unidad creada correctamente');
    expect(screen.getByRole('button', { name: 'Cerrar notificación' })).toBeTruthy();
    expect(items()[0].getAttribute('data-tone')).toBe('success');
    advance(NOTICE_DURATION.success! - 10);
    expect(live()).toHaveLength(1);
    advance(400);
    expect(items()).toHaveLength(0);
  });

  it('error: usa role="alert" y queda visible hasta que se cierra', () => {
    mount();
    act(() => void notify.error('No se pudo registrar el proveedor. Intentá nuevamente.'));
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Error: No se pudo registrar el proveedor');
    advance(120_000);
    expect(live()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar notificación' }));
    advance(300);
    expect(items()).toHaveLength(0);
  });

  it('advertencia e información usan sus variantes y duraciones', () => {
    mount();
    act(() => {
      notify.warning('Hay materiales sin precio');
      notify.info('Descarga en curso');
    });
    expect(items().map((n) => n.getAttribute('data-tone'))).toEqual(['warning', 'info']);
    advance(NOTICE_DURATION.info! + 300);
    expect(live().map((n) => n.getAttribute('data-tone'))).toEqual(['warning']);
    advance(NOTICE_DURATION.warning! + 300);
    expect(items()).toHaveLength(0);
  });

  it('el mismo mensaje repetido no se apila', () => {
    mount();
    act(() => {
      notify.success('Los cambios se guardaron');
      notify.success('Los cambios se guardaron');
      notify.success('Los cambios se guardaron');
    });
    expect(live()).toHaveLength(1);
  });

  it(`no acumula más de ${MAX_NOTICES} y conserva los errores`, () => {
    mount();
    act(() => {
      notify.error('Falla A');
      for (let i = 1; i <= 6; i++) notify.success(`Aviso ${i}`);
    });
    advance(300);
    const texts = live().map((n) => n.textContent);
    expect(texts).toHaveLength(MAX_NOTICES);
    expect(texts.some((t) => t?.includes('Falla A'))).toBe(true);
    expect(texts.some((t) => t?.includes('Aviso 6'))).toBe(true);
    expect(texts.some((t) => t?.includes('Aviso 1'))).toBe(false);
  });

  it('se pausa mientras el puntero está encima', () => {
    mount();
    act(() => void notify.success('Precio registrado correctamente'));
    fireEvent.mouseEnter(items()[0]);
    advance(NOTICE_DURATION.success! * 3);
    expect(live()).toHaveLength(1);
    fireEvent.mouseLeave(items()[0]);
    advance(NOTICE_DURATION.success! + 300);
    expect(items()).toHaveLength(0);
  });

  it('failure(): conflicto como advertencia y texto para el usuario', () => {
    mount();
    act(() => void notify.failure('No se pudo descargar la planilla', new ApiError(409, 'CONFLICT', 'Cotización vencida')));
    expect(items()[0].getAttribute('data-tone')).toBe('warning');
    expect(items()[0].textContent).toContain('Cotización vencida');
    act(() => void notify.failure('No se pudo descargar el PDF', new TypeError('Failed to fetch')));
    const err = items().find((n) => n.getAttribute('data-tone') === 'error')!;
    expect(err.textContent).toContain('Ocurrió un problema inesperado');
    expect(err.textContent).not.toContain('Failed to fetch');
  });

  it('no muestra éxito cuando el servidor rechaza la operación', async () => {
    function Form() {
      const toast = useToast();
      const m = useMutation(async () => {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Revisá los datos marcados e intentá nuevamente.');
      });
      return (
        <button
          onClick={async () => {
            if (await m.run()) toast.success('Unidad creada correctamente');
          }}
        >
          Guardar
        </button>
      );
    }
    render(<ToastProvider><Form /></ToastProvider>);
    await act(async () => void fireEvent.click(screen.getByText('Guardar')));
    expect(items()).toHaveLength(0);
  });
});
