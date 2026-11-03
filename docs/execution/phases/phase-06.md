# Fase 06 — Superficie de producto (B06)

Fase **no abierta globalmente**. Sólo B06-01 autorizado por D-048 como entrega parcial; Fase05 (harness) sigue abierta con c.1/c.3 BLOCKED.

## B06-01 — primera vertical API + Angular sintética

### Objetivo observable

Desde el navegador: crear una tarea sintética autorizada, ejecutarla, observar estado y evidencia persistida, reiniciar el backend y seguir viéndola, y registrar una revisión explícita (pendiente/aprobada/descartada).

### Interfaces reutilizadas (inspección previa)

- Kernel: `executeWorkflow` (runtime), `DurableStore` SQLite/CAS (persistence). Sin cambios.
- M04.1 `examples/bugfix/demo.ts`: `prepareBugfixDemo`/`runBugfixDemo`/`inspectBugfixDemo`/`reviewBugfixDemo` con `BugfixPolicy` propio. Aporta tests rojo/verde reales, diff y revisión.
- c.2 `examples/codex/adapter.ts`: `prepareSimulatedCodexRun`/`executeSimulatedCodexRun`/`inspectSimulatedCodexRun`. Aporta sólo propuesta saneada (hash de contenido), sin tests ni diff.

### Alcance

- `packages/runtime/examples/api/`: servicio de tareas, servidor `node:http` y CLI de arranque. Rutas `/api/v1`: `session`, `executors`, `tasks` (GET/POST), `tasks/:id` (GET), `tasks/:id/run`, `tasks/:id/review`. Sirve el build estático de Angular en el mismo origen.
- `apps/web/`: Angular standalone mínimo (lista, crear, ejecutar, detalle con tests/diff/propuesta, revisión).
- Tests: unitarios/integración del servicio y del HTTP (incl. reinicio), unitarios de la lógica de vista web y e2e con navegador real (Edge/Chromium local vía playwright-core, sin descargar navegadores).

### Exclusiones

Codex real, credenciales, inferencias, red externa, rutas/comandos/ejecutables elegidos por el cliente, proyectos ajenos (D-043), merge/push/publicación, dashboard completo, plugins, routing, multiagente, autenticación empresarial, nuevas abstracciones de persistencia, cambios al kernel.

### Seguridad

Bind fijo `127.0.0.1`; Host debe ser `127.0.0.1:<puerto>` o `localhost:<puerto>`; Origin, si existe, igual al propio; mutaciones con `Content-Type: application/json`, cuerpo ≤ 4 KiB y cabecera de token de sesión aleatorio por proceso. DTO estrictos (claves exactas). `--data` absoluto canónico existente y flag explícito `--allow-synthetic-tasks`. Una mutación a la vez. Sin reintentos: una tarea sólo se ejecuta si ningún bloque empezó; pending/uncertain tras reinicio se muestran bloqueados. CSP `default-src 'self'`, sin CORS.

### Aceptación

1. Crear/ejecutar/consultar tarea `synthetic-bugfix` y `codex-simulated` desde el navegador real.
2. Tests/diff/propuesta visibles sólo con evidencia de la propia tarea; `codex-simulated` no muestra tests ni diff.
3. Reinicio del backend conserva tareas, estado y evidencia (verificado por tests y e2e).
4. Revisión explícita aprobada/descartada registrada por M04.1; nunca automática.
5. Rechazos: Host/Origin/token/content-type/campos extra/ejecutor desconocido/campos de despacho real/hash de confirmación erróneo/re-ejecución.
6. Gates: frozen, peers, `pnpm.cmd check`, e2e, `git diff --check`.

### Rollback y siguiente nodo

Revert de los commits B06-01; los directorios de datos sintéticos se conservan (sin borrado automático). Siguiente nodo: revisión independiente suministrada por el propietario. No iniciar otro nodo.
