// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import { useMutation } from '@/lib/hooks';

type Body = { computationId: string; currency: string };
const body: Body = { computationId: 'c1', currency: 'ARS' };

function setup(behaviour: () => 'ok' | 'network' | 'pending') {
  const calls: { key: string; body: Body }[] = [];
  let release: () => void = () => {};
  const fn = (key: string, b: Body) => {
    calls.push({ key, body: b });
    const mode = behaviour();
    if (mode === 'network') return Promise.reject(new ApiError(0, 'NETWORK', 'timeout'));
    if (mode === 'pending') return new Promise<{ id: string }>((res) => (release = () => res({ id: 'v1' })));
    return Promise.resolve({ id: 'v1' });
  };
  const h = renderHook(() => useMutation(fn));
  return { h, calls, release: () => release() };
}

describe('VersionForm: Idempotency-Key por intención', () => {
  it('dos run() concurrentes (doble clic) envían una sola request', async () => {
    const { h, calls, release } = setup(() => 'pending');
    let p1: Promise<unknown>, p2: Promise<unknown>;
    await act(async () => {
      p1 = h.result.current.run(body);
      p2 = h.result.current.run(body);
      release();
      await Promise.all([p1, p2]);
    });
    expect(calls).toHaveLength(1);
    await expect(p2!).resolves.toBeUndefined();
  });

  it('tras error de red reintenta con la misma clave y mismo cuerpo', async () => {
    let n = 0;
    const { h, calls } = setup(() => (n++ === 0 ? 'network' : 'ok'));
    await act(async () => void (await h.result.current.run(body)));
    await act(async () => void (await h.result.current.run({ ...body })));
    expect(calls).toHaveLength(2);
    expect(calls[1].key).toBe(calls[0].key);
    expect(calls[1].body).toEqual(calls[0].body);
  });

  it('tras éxito la siguiente intención usa clave nueva', async () => {
    const { h, calls } = setup(() => 'ok');
    await act(async () => void (await h.result.current.run(body)));
    await act(async () => void (await h.result.current.run(body)));
    expect(calls[1].key).not.toBe(calls[0].key);
  });

  it('si el cuerpo cambia tras un error de red, se usa clave nueva', async () => {
    const { h, calls } = setup(() => 'network');
    await act(async () => void (await h.result.current.run(body)));
    await act(async () => void (await h.result.current.run({ ...body, currency: 'USD' })));
    expect(calls[1].key).not.toBe(calls[0].key);
  });
});
