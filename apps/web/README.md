# @ceo/web — Frontend V1

Next.js App Router + React + TypeScript. Sin librería de UI externa: design system propio (`app/globals.css`, `components/ui.tsx`) derivado de la demo `ceo-obras-demo.html` e iconos `lucide-react`.

## Convenciones (obligatorias para todo módulo)

- Datos: `lib/api.ts` (`api.get/post/put/patch/download`), hooks `useApi`, `usePaged`, `useAll`, `useMutation` en `lib/hooks.ts`. Nunca `fetch` directo.
- Tipos: `lib/openapi.d.ts` generado de `docs/api/openapi.json` (`pnpm api:types`). Usar `Schemas['X']` de `lib/api.ts`.
- Decimales son strings. Mostrar con `formatDecimal/formatQty/formatMoney`; parsear entradas con `parseDecimalInput`. Prohibido `Number()`/`parseFloat` sobre cantidades o importes. Los totales los calcula el backend.
- Fechas: `formatDate/formatDateTime`, `dateInputToIso`.
- Permisos: `useSession().can('perm')` (matriz en `lib/permissions.ts`). Si el rol no tiene el permiso, NO llamar el endpoint (pasar `null` como path al hook) y no renderizar la acción. Jefe de Obra nunca ve ni pide datos económicos.
- Pantalla: `<Page title crumb actions>` de `components/shell.tsx`; bloques `<Card>`; listas con `<DataTable>` + prop `mobile` (tarjetas en celular); `<PagerBar>`.
- Estados: `<Loading>`, `<Empty>`, `<ErrorBox error onRetry>`, `useToast()` para éxito, `<Confirm>` antes de operaciones sensibles, `<Modal side>` para formularios.
- Mutaciones idempotentes (OC, reservas, movimientos, recepciones, imports commit): `useMutation((key, ...) => api.post(path, body, { idempotencyKey: key }))`. La clave se conserva ante error de red y se renueva tras éxito o error de negocio.
- Errores 422: `fieldErrors(err)` para marcar campos; 409: mostrar mensaje y recargar.
- Sin datos hardcodeados que simulen integración. Sin botones sin acción.

## Desarrollo local

```bash
cp .env.example .env.local   # API_BASE_URL=http://localhost:3001
pnpm dev                     # http://localhost:3000
```

El proxy same-origin `app/api/v1/[...path]/route.ts` reenvía a `API_BASE_URL` preservando Origin, Cookie, Sec-Fetch-Site, Idempotency-Key y cada `Set-Cookie` por separado.
