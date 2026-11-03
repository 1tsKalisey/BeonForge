# Paquete de revisión: B06-01 — primera vertical API + Angular sintética

Revisión independiente requerida. **No declarar aceptada** hasta recibir la auditoría del propietario. El paquete anterior (B04-01c.2, cerrado) está en el historial de Git (`69e0136`).

## Alcance

Autorizado por D-048: API local loopback + UI Angular mínima sobre ejecuciones **exclusivamente sintéticas**. Ejecutores: M04.1 (`synthetic-bugfix`) y el adaptador c.2 (`codex-simulated`). Sin Codex real, credenciales, inferencias, red externa, merge ni publicación. c.1 global y c.3 BLOCKED; D-043 intacta.

Commits sobre `e5b829b`: 69e0136, ad3652e, 71adc20, de89ed0 y f974d91. Plan en [phase-06.md](../phases/phase-06.md); evidencia, gates y hashes en [b06-01-evidence.md](b06-01-evidence.md).

## Archivos

- API: `packages/runtime/examples/api/{tasks.ts,server.ts,cli.mjs,README.md}` y `packages/runtime/test/api.test.ts`.
- UI: `apps/web/` (Angular 22 standalone/zoneless), `src/app/{api.ts,view.ts,app.ts,app.html}`, tests `src/app/view.test.ts`, e2e `e2e/{run.mjs,verify-store.mjs}`.
- Workspace: `pnpm-workspace.yaml` (`apps/*`, `allowBuilds: false`, override del fallback WASI de oxc), `eslint.config.mjs`, `.gitignore`/`.prettierignore` (`artifacts/evidence/`, `.angular/`).

## Resultados declarados

- `pnpm.cmd check`: 795/795; frozen, peers y `git diff --check` exit 0.
- e2e con navegador real 10/10 sobre f974d91, incluido el reinicio del backend y la verificación independiente de SQLite/CAS.

## Qué revisar

1. **Seguridad HTTP** (`server.ts`): bind fijo `127.0.0.1`, Host (DNS rebinding), Origin/Sec-Fetch-Site, token por proceso, `Content-Type` JSON, límite de 4 KiB, CSP, ausencia de CORS y servido estático sin traversal ni symlinks.
2. **Autorización en backend** (`tasks.ts`): DTO con claves exactas y sin getters/prototipos/Proxy; registro fijo de ejecutores con `simulated: true`; `confirmPatchSha256` igual al preview; revisión ligada a `evidenceSha256` de la propia tarea; `--data` fuera del checkout.
3. **Sin reintentos**: sólo se ejecuta una tarea en la que ningún bloque ha empezado; pending/uncertain se muestra `blocked`; el slot de mutación se reserva antes de validar.
4. **Evidencia no combinada**: tests/diff sólo desde el store M04.1 de esa tarea; propuesta sólo desde el store c.2 de esa tarea; `codex-simulated` nunca muestra tests ni diff.
5. **Recuperación**: vistas derivadas del disco tras el reinicio (tests de servicio, HTTP y e2e).
6. **UI**: no puede convertir una ejecución simulada en real; sin controles de ruta, ejecutable o proveedor.
7. **Validez del e2e**: peticiones reales registradas y reapertura independiente del store, no mocks de frontend.

## Riesgos residuales y límites conocidos

- El token es anti-CSRF/DNS-rebinding, **no autenticación**: cualquier proceso local del mismo usuario actúa como operador.
- No hay lock entre procesos: dos servidores sobre el mismo `--data` podrían competir (fuera del uso documentado; la serialización es por proceso).
- `lastError` sólo vive en memoria; tras un reinicio el estado persistido manda.
- La caché de vistas no detecta cambios externos en el disco hasta la siguiente mutación o reinicio.
- Los tipos del cliente duplican los del servidor; la deriva sólo la detecta el e2e.
- La API vive en `runtime/examples`; promoverla a paquete requiere una decisión.
- Los tests muestran resúmenes de M04.1 (comando, exit, aserción, hash), no la salida TAP completa.
- El reinicio en el e2e se hace con la tarea completada; la interrupción a mitad de ejecución se cubre a nivel de servicio (cierre cooperativo) y con los tests SIGKILL de M04.1, no a través de HTTP.
- El e2e no está en `pnpm check`: requiere Edge u otro Chromium instalado.
- Las carpetas `%TEMP%/beonforge-e2e-data-*` de los e2e no se borran automáticamente.
- 215 dependencias nuevas de Angular con scripts de instalación deshabilitados; override del fallback WASI.
- No es un sandbox de SO ni de red; se mantienen todos los límites de M04.1 y c.2 y el F2 de c.2 sigue abierto.

## Siguiente paso

Exclusivamente la revisión independiente suministrada por el propietario. Clasificar y reproducir los hallazgos antes de corregir. No iniciar otro nodo.
