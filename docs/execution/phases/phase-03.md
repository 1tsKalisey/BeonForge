# Fase 03 — Primer proveedor local

Estado: abierta. Fases 01 y 02 aceptadas/cerradas; D-036 ACCEPTED permanece vigente.

## Correctivo acotado B05-01 — auditoría REQUEST_CHANGES

- Objetivo único: terminar cada petición HTTP incluso ante upgrade/close/abort sin eventos de transporte, conservando la API y restricciones de origen/agente/límites.
- Archivos: src/index.ts, test/probe.test.ts y fixtures de prueba (barrera de sockets/subprocesos); README y evidencias de ejecución. Sin dependencias ni otros módulos funcionales.
- Dependencias: P1 reproducido contra dist actual (dos rojas: promesa pendiente tras 200 ms; CLI exit 13). Sin consultar Ollama real.
- Aceptación: upgrade rechazado, close prematuro y abort con settlement único, deadline efectivo, sockets/listeners liberados y 200 completo sin falsa caída; CLI JSON/exit válidos; tests negativos no pueden acceder al 11434 real aunque falle la validación.
- Gates: Node 24.19.0, rojas/verdes, 508 anteriores más nuevas regresiones, frozen/peers/check/diff/secretos. P3 sólo parser estricto/prueba de proxy si mínimos; restantes seguimientos explícitos.
- Exclusiones/seguridad: sin inferencia, descargas, prueba real, nuevos clientes/frameworks o cambios a CAS/contexto/kernel. B05-02 no iniciado.
- Rollback: revert sólo correctivo, manteniendo datos y contratos anteriores; conservar P1 bloqueante si se revierte. Próximo gate: revisión independiente focalizada; B05-01 abierto hasta aceptación.

### Evidencia correctiva — 4e00fea

REQUEST_CHANGES independiente recibido. Dos regresiones **rojas** contra build anterior: HTTP101 sigue pending tras 800 ms pese a timeout 200; CLI termina exit13 sin JSON esperado. Logs red.out/err completos, exit1. Ahora tres casos HTTP101 (plazo predeterminado, 200 ms, CLI) verdes: invalid_response; CLI JSON exacto `{error:{code:"probe_invalid_response"}}`, exit1, sin unsettled top-level await. GET/loopback/agente privado/límites/redirects/API v1 intactos.

**77/77 probe**, **519/519 total** (508 anteriores + 11): contratos 62, persistencia 115, runtime 71, workspace 187, Ollama 77, spike 7; sin skips/fallos en corrida completa. Node 24.19.0/SQLite 3.53.3. Frozen/peers/check exit nativo 0: formato/lint/typecheck/build/tests; diff/secretos verdes. Workspace 631.39 s, probe 1.78 s. Refuerzo final de auto-prueba del guard, sólo tests: 77/77 repetidos en 1.82 s, formato/lint/typecheck finales nativos 0. No código productivo cambiado tras build/check completo.

Pruebas nuevas: HTTP101 API/CLI, abort con destroy sin eventos (timeout/cancel), close sin respuesta/error, reset/body truncado, tres 200 completos con close normal, cancelación durante body y auto-prueba del guard. Errores tardíos tras abort no escapan ni repiten destrucción; listeners retirados tras close, sockets del mock liberados. Guard test-only antes de DNS en runner/CLI, sólo mocks y veto absoluto 11434; entradas negativas sustituidas por puertos asignados, auto-prueba del puerto real sin socket. Sin probe real/inferencia/descargas.

P3 proxy: sustituida prueba ineficaz por hijo con env activo desde startup, testigo del proxy global antes/después de borrar env y probe directo. P3 parser: false explícito, header hostil bajo --insecure-http-parser falla tipado. P3 clasificación inesperada y CLI SIGINT/otros errores siguen pendientes; no resueltos por este cambio. R-061 no reproducida/no resuelta.

Logs/exit codes/hashes completos: `%TEMP%/beonforge-b0501-p1-afad27ab2d074169850331efbcd70bf3/` (red.*, green.*, guard-final.*, check.*, final-format/lint/typecheck.*); focused-final logs sin exit corresponden a interrupción, no evidencia de gate. Un lint de fixture (URL no importada) corregido antes de gates; no intermitencia inferida. Estado: **P1 corregido localmente, B05-01 abierto hasta revisión independiente focalizada**. No iniciar B05-02/Fase 04 ni cerrar Fase 03.

## B05-01 — Probe local autorizado de Ollama

- Objetivo: comprobar disponibilidad, versión y nombres de modelos instalados mediante GET /api/version y GET /api/tags, sin inferencia.
- Dependencias: Fases 01/02 cerradas; autorización explícita del caller para un origen HTTP loopback literal y puerto concreto. No se consume contexto: clasificación/evals de inferencia siguen pendientes.
- Archivos: nuevo módulo privado packages/ollama (fuente, CLI, tests contra dist, documentación/configuración mínima), lockfile sólo por registro del workspace; estado, cobertura, riesgos y paquete de revisión.
- Incluido: probeOllama con resultado v1 disponible/available_no_models; errores tipados; CLI probe --endpoint ORIGIN --allow-local-probe [--timeout-ms N]. GET sin body, límites y cancelación global de la operación, JSON/schema verificados.
- Excluido: inferencia, registry genérico, lectura de CAS/workspaces, contexto/instrucciones, credenciales, descargas/model lifecycle, descubrimiento de endpoints, SDK, routing, agentes, UI y prueba real no autorizada.
- Seguridad: sólo http://127.0.0.1:PORT o http://[::1]:PORT canónicos, sin userinfo/path/query/fragment, DNS, redirects o proxies. Rechazo de entorno proxy activo; transporte HTTP nativo directo con agente privado. Respuestas no confiables, UTF-8 estricto, límites finitos, errores estáticos sin respuestas/rutas/causas privadas.
- Aceptación/tests: HTTP local simulado real, ambas rutas y sólo GET sin payload; disponible/vacío/no disponible, timeout/cancelación incluso durante body, HTTP/JSON/schema/UTF-8 inválidos y volumen, destinos ambiguos/no autorizados, redirects sin seguimiento, proxies sin tráfico. CLI compilada en proceso separado; test real sólo con autorización expresa y opt-in separado.
- Gates: Node 24.19.0; frozen, peers, formato, lint con tipos, typecheck, build, suite anterior 442 más tests nuevos, diff y escaneo de secretos. Logs completos ante fallos.
- Demo: servidor local de prueba → CLI autorizada → JSON con versión/modelos; requests observadas exactamente /api/version y /api/tags sin datos privados.
- Rollback: revert acotado de código/registro B05-01, sin modificar datos existentes ni fases aceptadas.
- Siguiente: revisión independiente del usuario. B05-02 no definido/iniciado; cualquier inferencia futura requiere política/clasificación, payload/destino autorizados y evals/cancelación/límites.

Fuentes oficiales consultadas: https://docs.ollama.com/api/tags y sección Version de https://github.com/ollama/ollama/blob/main/docs/api.md (GET /api/version, objeto version). No se añaden otras operaciones de API.

### Evidencia B05-01 — implementación lista para revisión

`ca825ce` registra nodo; `7a37b10` implementa módulo/CLI y tests, sin dependencias nuevas ni cambios a contratos previos/lockfile. Build y consumidores resuelven exports dist. **66 tests nuevos**, suite completa **508/508** (442 anteriores preservados), sin fallos/skips: 62 contratos, 115 persistencia, 71 runtime, 187 workspace, 66 Ollama, 7 spike. Node 24.19.0/SQLite 3.53.3; frozen/peers/check con exit nativo 0, formato/lint/typecheck/build/tests/diff/secretos verdes. Workspace 701.79 s; probe 1.06 s. Dos fallos de lint y parametrización de tests CLI corregidos antes del gate; no fallo intermitente reproducido, R-061 no resuelto.

| Criterio | Evidencia concreta |
|---|---|
| Sólo metadatos permitidos | test/probe.test.ts: compiled export y demo CLI independiente observan exactamente GET /api/version y /api/tags, sin body/cookies/authorization; campos extra no retornados. README distingue fixtures de instalación real. |
| Autorización y destino | tests own/inherited/getter/null, revocación antes del segundo GET, IPv4/IPv6, 16 endpoints ambiguos/no autorizados incluidos whitespace/puertos inválidos; cero tráfico ante denegación. |
| Redirecciones/proxies | Location con receptor local separado no consultado; seis variables proxy y NO_PROXY=* rechazados; agente privado probado con NODE_USE_ENV_PROXY=1 sin proxy configurado. |
| Fallos y límites | Servicio detenido; instalación vacía; HTTP 400/401/500; JSON/schema/UTF-8/encoding/media type inválidos; headers/body declarados/chunked excesivos, modelos/nombres excedidos; interrupción de conexión. Códigos exactos sanitizados. |
| Deadline/cancelación | Timeout antes de headers, durante body y en segundo GET; señal antes/durante petición sin exponer reason; invalid timeout antes de red. |
| CLI/demo | Proceso node de dist/cli.js, JSON v1 con tiny:latest y versión fixture 0.5.1; argumentos inválidos/missing authorization/decimal rechazados. Instalación Ollama no necesaria para los tests. |

Logs completos de gates, exit nativos y hashes en `%TEMP%/beonforge-b0501-6b9b8c55699744bf901bbbee49fc9d78/`. Prueba real opcional test/real-probe.mjs exige `--authorize-real-probe` y origen concreto; fuera de suite automática y **no ejecutada**. Por petición adicional se instaló Ollama 0.40.13 con WinGet en usuario, hash del instalador oficial verificado, exit 0, versión instalada y socket 127.0.0.1:11434 verificados sin GET real. No descarga de modelos solicitada/realizada por BeonForge.

Estado: **implementado, pendiente de revisión independiente** suministrada por usuario. R-063 y previos conservados. Fase 03 abierta; próximo gate exclusivo: revisión B05-01. No iniciar B05-02, inferencia o Fase 04. Vault complementario sigue ausente; no knowledge/.claude ni main modificados.
