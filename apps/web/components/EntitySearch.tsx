'use client';
import { useCallback } from 'react';
import { api, type Page } from '@/lib/api';
import { Combobox } from './Combobox';
import { entityOption, type EntityResource } from './EntityPicker';
/** Free text filters a list; choosing an entity restricts it by ID, never navigates. */
export function EntitySearch({
  resource,
  label = 'Buscar',
  placeholder,
  inputId,
  query = {},
  text,
  id,
  onChange,
}: {
  resource: EntityResource;
  label?: string;
  placeholder?: string;
  inputId?: string;
  query?: Record<string, string | boolean | undefined>;
  text: string;
  id: string;
  onChange: (text: string, id: string) => void;
}) {
  const queryKey = JSON.stringify(query);
  const load = useCallback(
    async (search: string, page: number, signal: AbortSignal) => {
      const r = await api.get<
        Page<{ id: string; name: string; code?: string }>
      >(
        '/' + resource,
        { ...query, search: search || undefined, page, pageSize: 25 },
        signal,
      );
      return { options: r.data.map(entityOption), total: r.pagination.total };
    },
    [resource, queryKey],
  );
  return (
    <Combobox
      id={inputId}
      label={label}
      placeholder={placeholder}
      value={id}
      query={text}
      onQueryChange={(q) => onChange(q, '')}
      onChange={(o) => onChange(o?.label ?? '', o?.value ?? '')}
      loadOptions={load}
    />
  );
}
