# Fase 03 — Primer proveedor local

Estado: abierta. Fases 01 y 02 aceptadas/cerradas; D-036 ACCEPTED permanece vigente.

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
