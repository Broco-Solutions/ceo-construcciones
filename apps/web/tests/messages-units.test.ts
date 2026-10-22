import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, fieldErrors, fieldLabel, friendlyError, issueMessage } from '@/lib/api';
import { unitLabel, unitSymbol } from '@/lib/units';

describe('Mensajes de validación en español', () => {
  it('traduce los mensajes estándar', () => {
    expect(issueMessage('Required')).toBe('Completá este campo');
    expect(issueMessage('String must contain at least 1 character(s)')).toBe('Completá este campo');
    expect(issueMessage('Expected string, received null')).toBe('Completá este campo');
    expect(issueMessage('String must contain at most 20 character(s)')).toBe('Máximo 20 caracteres');
    expect(issueMessage('Invalid')).toBe('Valor no válido');
    expect(issueMessage("Invalid enum value. Expected 'ARS' | 'USD', received 'EUR'")).toBe('Elegí una opción válida');
    expect(issueMessage('Array must contain at least 1 element(s)')).toBe('Agregá al menos un renglón');
    expect(issueMessage('Stock disponible insuficiente')).toBe('Stock disponible insuficiente');
  });

  it('nombra el campo con palabras del usuario', () => {
    expect(fieldLabel(['lines', 1, 'quantity'])).toBe('Renglón 2 · Cantidad');
    expect(fieldLabel(['symbol'])).toBe('Símbolo');
    expect(fieldLabel(['internalHash'])).toBe('');
  });

  it('fieldErrors devuelve los mensajes traducidos por campo', () => {
    const e = new ApiError(422, 'VALIDATION_ERROR', 'x', [{ path: ['name'], message: 'Required' }]);
    expect(fieldErrors(e)).toEqual({ name: 'Completá este campo' });
    const flat = new ApiError(422, 'VALIDATION_ERROR', 'x', { formErrors: [], fieldErrors: { laborCost: ['Invalid'] } });
    expect(fieldErrors(flat)).toEqual({ laborCost: 'Valor no válido' });
  });

  it('no muestra errores internos del navegador', () => {
    expect(friendlyError(new TypeError('Cannot read properties of undefined'))).toBe('Ocurrió un problema inesperado. Intentá nuevamente.');
    expect(friendlyError(new Error('El archivo no tiene filas.'))).toBe('El archivo no tiene filas.');
  });
});

describe('Errores del servidor con lenguaje de usuario', () => {
  afterEach(() => vi.unstubAllGlobals());
  const reply = (status: number, error: { code: string; message: string }) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error }), { status, headers: { 'content-type': 'application/json' } })));
  const fail = async () => {
    try {
      await api.post('/units', { name: 'x' });
    } catch (e) {
      return e as ApiError;
    }
    throw new Error('debía fallar');
  };

  it('reemplaza textos técnicos', async () => {
    reply(409, { code: 'CONFLICT', message: 'La clave de idempotencia ya fue utilizada con otros datos' });
    expect((await fail()).message).not.toMatch(/idempotencia/i);
    reply(400, { code: 'INVALID_JSON', message: 'JSON inválido' });
    expect((await fail()).message).not.toMatch(/JSON/);
    reply(422, { code: 'VALIDATION_ERROR', message: 'Datos inválidos.' });
    expect((await fail()).message).toBe('Revisá los datos marcados e intentá nuevamente.');
  });

  it('conserva las reglas de negocio tal como las informa el servidor', async () => {
    reply(409, { code: 'CONFLICT', message: 'Recepción excede cantidad pendiente' });
    expect((await fail()).message).toBe('Recepción excede cantidad pendiente');
  });
});

describe('Unidades de medida', () => {
  it('muestra nombre y símbolo en selectores', () => {
    expect(unitLabel({ code: 'UNI-003', name: 'Metro cuadrado', symbol: 'm²' })).toBe('Metro cuadrado (m²)');
    expect(unitLabel({ code: 'UNI-013', name: 'Jornal', symbol: 'jornal' })).toBe('Jornal');
  });
  it('acompaña cantidades con el símbolo y nunca con el código automático', () => {
    expect(unitSymbol({ code: 'UNI-007', name: 'Kilogramo', symbol: 'kg' })).toBe('kg');
    expect(unitSymbol({ code: 'UNI-020', name: 'Bolsa', symbol: null })).toBe('Bolsa');
    // Unidades cargadas antes de los códigos automáticos conservan su código manual.
    expect(unitSymbol({ code: 'KG', name: 'Kilogramo', symbol: null })).toBe('KG');
    expect(unitLabel({ code: 'KG', name: 'Kilogramo', symbol: null })).toBe('Kilogramo (KG)');
    expect(unitSymbol(undefined)).toBe('');
  });
});
