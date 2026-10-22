// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Los componentes del módulo usan JSX sin import explícito de React (runtime clásico en vitest).
vi.hoisted(async () => {
  (globalThis as { React?: unknown }).React = (await import('react')).default;
});
vi.mock('@/lib/session', () => ({ useSession: () => ({ user: { id: 'u1', name: 'Yo' }, can: () => true }) }));
import { AmountWarning, ROUNDING_WARNING, ExistingOrdersWarning, type OrderDetail } from '@/components/compras/common';

afterEach(cleanup);

const base = {
  currency: 'ARS',
  taxBasis: 'EXCLUDED',
  totalAmount: '10',
  amountWarning: null,
  lines: [{ lineAmount: '10' }],
} as unknown as OrderDetail;

describe('AmountWarning', () => {
  it('no se muestra si el servidor informa importes', () => {
    render(<AmountWarning order={base} />);
    expect(screen.queryByTestId('oc-rounding-warning')).toBeNull();
  });
  it('muestra la advertencia con ROUNDING_POLICY_REQUIRED', () => {
    render(<AmountWarning order={{ ...base, totalAmount: null, amountWarning: 'ROUNDING_POLICY_REQUIRED', lines: [{ lineAmount: null }] } as unknown as OrderDetail} />);
    expect(screen.getByTestId('oc-rounding-warning').textContent).toContain(ROUNDING_WARNING);
  });
  it('muestra la advertencia si algún importe es null aunque falte amountWarning', () => {
    render(<AmountWarning order={{ ...base, lines: [{ lineAmount: null }] } as unknown as OrderDetail} />);
    expect(screen.getByTestId('oc-rounding-warning')).toBeTruthy();
  });
});

describe('ExistingOrdersWarning', () => {
  it('lista OC existentes con enlace y pide confirmación explícita', () => {
    const onAck = vi.fn();
    render(<ExistingOrdersWarning existing={{ rows: [{ id: 'o1', number: 7, status: 'DRAFT' } as never], total: 1, loading: false, error: null }} ack={false} onAck={onAck} />);
    const link = screen.getByText('OC-7') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/ordenes/o1');
    (screen.getByTestId('oc-duplicate-ack') as HTMLInputElement).click();
    expect(onAck).toHaveBeenCalledWith(true);
  });
  it('no muestra nada sin órdenes', () => {
    render(<ExistingOrdersWarning existing={{ rows: [], total: 0, loading: false, error: null }} ack={false} onAck={() => {}} />);
    expect(screen.queryByTestId('oc-duplicate-warning')).toBeNull();
  });
});
