# CEO Construcciones — continuidad local de Codex

Estos archivos preparan desarrollo en Ubuntu/WSL. No ejecutan trabajo en el equipo desde ChatGPT ni garantizan que el entorno del usuario ya esté listo.

## Archivos
- `CEO_Preparar_Local.sh`: valida repositorio y herramientas, preserva el trabajo (también archivos sin seguimiento), comprueba escritura Git fuera del sandbox, crea rama si estabas en main y prepara PostgreSQL 18 local.
- `CEO_Verificar_Local.sh`: ejecuta bloques de API, web o E2E con logs privados. API y E2E usan bases distintas y nuevas por ejecución.
- `CEO_Reanudar_Codex.txt`: instrucciones para continuar el plan sin reiniciar el incremento ni omitir pruebas.
- `CEO_Construcciones_Auditoria_Gap_2026-11-02.md`: auditoría complementaria original.

El plan maestro se conserva tal como ya está en la raíz. No se incluyen archivos con nombres de código de aplicación ni se sobrescribe ese código al extraer.

## Preparar
1. Salir de la ejecución activa de Codex y usar una terminal normal de Ubuntu/WSL. No usar sudo codex.
2. Guardar/extraer el contenido del paquete en `/home/rcoirini/proyectos-bs/ceo-construcciones`. No reemplazar versiones locales modificadas de estos auxiliares sin revisarlas.
3. Usar Node 24 y pnpm del proyecto. Docker debe responder desde WSL. Con Docker Desktop: iniciarlo en Windows y habilitar Ubuntu en Settings > Resources > WSL Integration si falta. No instalar un segundo motor encima del existente.
4. Ejecutar:

```bash
cd /home/rcoirini/proyectos-bs/ceo-construcciones
bash CEO_Preparar_Local.sh
```

El preparador **no instala paquetes, no ejecuta migraciones, no hace commit ni push**. Hace solo lecturas remotas para comprobar el acceso. Si detecta herramientas/credenciales ausentes, explica qué falta. Si no encuentra el archivo de estado del incremento, no continúa sobre una copia equivocada.

Para GitHub CLI, si no está autenticado:

```bash
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git --hostname github.com
```

Si falta `gh`, instalar GitHub CLI para Ubuntu con el método oficial antes del flujo PR. No compartir tokens por chat. La sesión de GitHub en ChatGPT no equivale a tener GitHub CLI autenticado en WSL.

## Reanudar

```bash
source "$HOME/.local/state/ceo-construcciones-codex/local.env"
cd /home/rcoirini/proyectos-bs/ceo-construcciones
codex resume --last --sandbox workspace-write --ask-for-approval on-request
```

Pegar `CEO_Reanudar_Codex.txt`. Revisar y aprobar las solicitudes necesarias. La política workspace-write protege `.git`: el cambio relevante es permitir solicitar aprobaciones, **no prometer que .git se vuelva escribible dentro del sandbox**. Políticas administradas tienen prioridad.

Si no existe una sesión local en ese directorio, ejecutar `codex --sandbox workspace-write --ask-for-approval on-request` y pegar el mismo texto; los archivos locales son el checkpoint. Si la tarea anterior vivía en otra copia/worktree/nube, recuperar sus cambios en vez de empezar sobre un árbol vacío.

## Recursos locales y pruebas
PostgreSQL se publica en un puerto automático de 127.0.0.1 y guarda solo datos sintéticos. Una contraseña aleatoria queda fuera del repo, en un archivo con modo 600. No ejecutar contra un contexto Docker remoto. No se utilizan `--privileged`, montajes de la máquina dentro de PostgreSQL ni secretos cloud.

Los wrappers no instalan dependencias y deben ejecutarse luego de `pnpm install --frozen-lockfile`. Playwright/Chromium puede requerir instalación local antes del E2E. No presentarlo como fallo funcional del sistema.

```bash
bash CEO_Verificar_Local.sh api
bash CEO_Verificar_Local.sh web
bash CEO_Verificar_Local.sh e2e
```

E2E usa el script del repositorio, que ocupa 3000/3001. El wrapper comprueba que estén libres y **no mata procesos desconocidos**. No ejecutar bloques simultáneos que compitan por builds o puertos.

Las bases de prueba se conservan para diagnóstico, no se borran automáticamente. El contenedor puede detenerse cuando no se trabaje con `docker stop ceo-codex-tests`; el preparador lo reutiliza al reiniciar. No usar `docker system prune`, ni `docker rm` sobre servicios ajenos. La copia local de trabajo puede contener archivos privados; no subirla a GitHub.

## Validación de los auxiliares
Se verificó sintaxis Bash y se probaron rutas de preparación y controles con herramientas simuladas. No se ejecutó la aplicación ni Docker/PostgreSQL reales en el WSL del usuario desde ChatGPT. Los resultados de la aplicación deben obtenerse en su entorno y en CI.

## Referencias comprobadas
- OpenAI, sandbox/aprobaciones: https://learn.chatgpt.com/docs/agent-approvals-security
- OpenAI, comandos/resume: https://learn.chatgpt.com/docs/developer-commands?surface=cli
- Docker Desktop + WSL: https://docs.docker.com/desktop/features/wsl/
- Docker, publicación de puertos: https://docs.docker.com/engine/network/port-publishing/
- Imagen oficial PostgreSQL: https://hub.docker.com/_/postgres
- GitHub CLI, autenticación: https://cli.github.com/manual/gh_auth_login
- Script E2E del proyecto: https://github.com/Broco-Solutions/ceo-construcciones/blob/main/apps/web/scripts/e2e-ci.sh
