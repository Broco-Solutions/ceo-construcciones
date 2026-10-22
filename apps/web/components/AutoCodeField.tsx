'use client';
import { TextField } from '@/components/ui';

/** El código se reserva de forma transaccional en la API, nunca en el navegador. */
export const AUTO_CODE = 'AUTO';

export function AutoCodeField({ prefix, value }: { prefix: string; value?: string | null }) {
  return (
    <TextField
      label="Código (automático)"
      value={value || prefix + '-...'}
      readOnly
      className="autocode-field"
      hint={value ? 'Código asignado al crear el registro.' : 'Se asigna automáticamente al guardar.'}
    />
  );
}
