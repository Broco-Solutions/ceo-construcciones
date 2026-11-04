# Login — comparación visual

Base: main `25e8bacb1bd1f8433ccecd51d7f97724088a10e5` (PR15 integrado, diseño de login anterior). Rama `codex/login-restyling`.

Se inspeccionaron las doce capturas nuevas: vacío, error 401 real, Bloq Mayús y contraseña visible a 1440/1024/360. La variante 360 usa viewport 360×740: formulario y pie completos, sin scroll vertical ni horizontal en los cuatro estados. Tipografía, foco, textos, logo y botones legibles. Antes se capturaron vacío/error; el diseño anterior no tenía mostrar contraseña ni aviso de Bloq Mayús.

Los campos usan exclusivamente ejemplos ficticios sin cuenta existente. La contraseña visible no es una credencial del entorno. La API y PostgreSQL son reales y aislados. Para el estado de Bloq Mayús se envía un KeyboardEvent con el modificador explícito: el estado del teclado del SO no es portable en headless. No se simulan respuestas de autenticación ni persistencia. Las capturas desactivan movimiento por la preferencia soportada del navegador.

| Ancho | Antes vacío | Antes error | Nuevo vacío | Nuevo error | Bloq Mayús | Visible |
|---|---|---|---|---|---|---|
| 1440 | [Ver](antes-vacio-1440.png) | [Ver](antes-error-1440.png) | [Ver](despues-vacio-1440.png) | [Ver](despues-error-1440.png) | [Ver](despues-bloq-mayus-1440.png) | [Ver](despues-visible-1440.png) |
| 1024 | [Ver](antes-vacio-1024.png) | [Ver](antes-error-1024.png) | [Ver](despues-vacio-1024.png) | [Ver](despues-error-1024.png) | [Ver](despues-bloq-mayus-1024.png) | [Ver](despues-visible-1024.png) |
| 360 | [Ver](antes-vacio-360.png) | [Ver](antes-error-360.png) | [Ver](despues-vacio-360.png) | [Ver](despues-error-360.png) | [Ver](despues-bloq-mayus-360.png) | [Ver](despues-visible-360.png) |

Verificación: `bash CEO_Verificar_Local.sh web` (52 pruebas, typecheck/build) y `bash CEO_Verificar_Local.sh e2e` (suite completa). `login-ui.test.tsx` comprueba la retrocompatibilidad de TextField, mostrar/ocultar y los eventos del aviso. `login-visual.spec.ts` verifica los cuatro estados y su geometría; `auth.spec.ts` y `helpers.ts` se conservan, incluidos 401/429, cookies, logout y redirecciones.

`submit` conserva el mismo AST; los efectos de sesión y cuenta regresiva permanecen iguales. Sin cambios en API, permisos, esquema, imágenes de marca o infraestructura. PR y checks registran el candidato definitivo.
