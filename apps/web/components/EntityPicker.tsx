'use client';
import { useCallback } from 'react';
import { api, type Page } from '@/lib/api';
import { Combobox, type ComboOption } from './Combobox';
export type EntityResource =
  | 'clients'
  | 'works'
  | 'suppliers'
  | 'materials'
  | 'apu-items'
  | 'categories'
  | 'units'
  | 'locations'
  | 'labor-resources'
  | 'presentations'
  | 'reservations';
type Row = {
  id: string;
  name?: string;
  code?: string | null;
  taxId?: string | null;
  active?: boolean;
  client?: { name: string };
  category?: { name: string } | null;
  unit?:
    | { symbol?: string | null; code?: string | null; name: string }
    | string
    | null;
  baseQuantity?: string;
  quantity?: string;
  fulfilledQuantity?: string;
};
export const entityOption = <T extends Row>(row: T): ComboOption<T> => ({
  value: row.id,
  label:
    row.name ??
    row.code ??
    (row.quantity !== undefined ? 'Reserva ' + row.id.slice(-6) : 'Referencia'),
  description: [
    row.quantity !== undefined
      ? `${row.quantity} reservados · ${row.fulfilledQuantity ?? '0'} transferidos`
      : null,
    row.code,
    row.baseQuantity ? 'Cantidad base: ' + row.baseQuantity : null,
    row.taxId,
    row.client?.name,
    row.category?.name,
    typeof row.unit === 'string'
      ? row.unit
      : (row.unit?.symbol ?? row.unit?.name),
    row.active === false ? 'Inactivo · vínculo histórico' : null,
  ]
    .filter(Boolean)
    .join(' · '),
  disabled: row.active === false,
  data: row,
});
export function EntityPicker<T extends Row>({
  resource,
  query,
  value,
  selectedLabel,
  onChange,
  ...props
}: {
  resource: EntityResource;
  query?: Record<string, string | number | boolean | null | undefined>;
  value?: string | null;
  selectedLabel?: string;
  onChange: (row: T | null) => void;
} & Omit<
  React.ComponentProps<typeof Combobox<T>>,
  'options' | 'loadOptions' | 'resolveOption' | 'value' | 'onChange' | 'query'
>) {
  const queryKey = JSON.stringify(query ?? {});
  const loadOptions = useCallback(
    async (search: string, page: number, signal: AbortSignal) => {
      const result = await api.get<Page<T>>(
        '/' + resource,
        { ...query, search: search || undefined, page, pageSize: 25 },
        signal,
      );
      return {
        options: result.data.map(entityOption),
        total: result.pagination.total,
      };
    },
    [resource, queryKey],
  );
  const resolveOption = useCallback(
    async (id: string, signal: AbortSignal) =>
      entityOption(
        (
          await api.get<{ data: T }>(
            '/' + resource + '/' + id,
            undefined,
            signal,
          )
        ).data,
      ),
    [resource],
  );
  return (
    <Combobox<T>
      {...props}
      resource={resource}
      options={selectedLabel && value ? [{ value, label: selectedLabel }] : []}
      key={resource + ':' + queryKey}
      value={value}
      onChange={(o) => onChange(o?.data ?? null)}
      loadOptions={loadOptions}
      resolveOption={resolveOption}
    />
  );
}
