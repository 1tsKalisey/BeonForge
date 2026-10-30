# Fase 03 — Primer proveedor local

Estado: abierta. Fases 01 y 02 aceptadas/cerradas; D-036 ACCEPTED permanece vigente.

## Estado vigente — aceptación independiente B05-01

**B05-01 CERRADO**, veredicto **APPROVE_WITH_FOLLOWUPS** aportado por el propietario. Claude confirma resuelto el P1 HTTP101 de `4e00fea`; R-064 resuelto y no bloqueante. Evidencia previa: **519/519** tests y gates locales, contrastados mediante logs/exit codes/hashes; **no se afirma que Claude ejecutara la suite completa**. En este cierre se verificaron 37 hashes, sin discrepancias, y exits de frozen/peers/check/final-format/lint/typecheck/guard-final=0; no se repitieron pruebas ni auditorías. Logs: `%TEMP%/beonforge-b0501-p1-afad27ab2d074169850331efbcd70bf3/`. Registros siguientes de REQUEST_CHANGES/pendiente son históricos, sustituidos por esta aceptación.

Seguimientos no bloqueantes: clasificación de RST y errores inesperados, cobertura CLI SIGINT/otros errores, R-061 no reproducida/sin causa identificada (no resuelta). R-063 y riesgos previos siguen vigentes; loopback no autentica al servicio. Fase 03 no completada.

Entorno requerido para continuar: **Node 24.19.0 instalado en ubicación estable fuera de %TEMP%**, con versión/binario/ruta efectiva comprobados antes de gates. La evidencia portátil previa sigue válida como histórica, pero %TEMP% no es dependencia operativa aceptable. No se instala, mueve ni cambia versión, PATH o herramienta automáticamente en este cierre.

## B05-02 — Primera inferencia local sintética autorizada

**Estado: delimitado/listo para autorización de implementación; no implementado ni ejecutado.** Identificador siguiente al B05-01 cerrado, dentro de Fase 03/B05; no existía definición anterior. No habilita Fase 04 ni cierra Fase 03.

- **Objetivo:** una única inferencia local explícitamente autorizada, verificable y cancelable, sobre un prompt sintético público fijo: solicitar JSON `{ "answer": 4 }` para `2+2`. Sin entrada libre, ContextPackage, instrucciones del operador, código privado, filesystem o CAS.
- **Interfaces propuestas mínimas:** `prepareSyntheticInference({ endpoint, model }) -> SyntheticInferencePreviewV1` puro/sin red: payload UTF-8 canónico fijo, SHA-256 de todos los bytes que se enviarán y límites/política v1. `runSyntheticInference(preview, grant, { timeoutMs?, signal? }) -> SyntheticInferenceReportV1`. Preview y hash son datos, nunca autoridad. Report sólo contiene veredicto validado/answer=4, modelo y hash; no devuelve texto libre ni thinking.
- **Autorización:** grant vivo del caller, no serializado como permiso: propiedades propias de datos `canInfer: true`, `allowLocalProbe: true`, `endpoint`, `model`, `payloadSha256`. Rechazar herencia, accessors, Proxy y objetos malformados con códigos sanitizados. Validar coincidencia exacta con bytes/opciones/modelo/destino, inicialmente, antes del POST y antes de devolver resultado. Revocación previa al despacho impide POST; señal permite cancelar en curso. El permiso de metadata B05-01 no autoriza inferencia ni viceversa; el grant declara ambos explícitamente para preflight. No copiar permisos en un snapshot que ignore revocaciones posteriores.
- **Modelo y destino:** únicamente origen literal permitido por B05-01. Preflight B05-01 autorizado y acotado confirma nombre instalado exacto antes de POST; no selección automática, fallback ni pull. Si falta modelo, fallar `model_not_installed`, sin POST. Rechazar identificadores cloud/remotos; para demo real el operador debe verificar servicio confiable en modo local-only y modelo local instalado, sin alias/retag concurrente. Nombre listado no acredita por sí solo autenticidad/localidad: no se promete pin atómico de modelos ni sandbox del servicio. Modo local-only según FAQ oficial (disable_ollama_cloud/OLLAMA_NO_CLOUD) es precondición del operador, no reconfiguración automática.
- **Petición oficial:** sólo `POST /api/generate`, `stream:false`, `format:"json"`, prompt fijo y opciones acotadas `temperature:0`, `num_predict:64`, `num_ctx:1024`; sin herramientas, images, suffix, system/context heredado o opciones arbitrarias. Tamaño prompt <=1 KiB y body completo <=4 KiB UTF-8. No regenerar bytes distintos de los autorizados. No se exige determinismo de los bytes generados: sí contrato/veredicto verificables.
- **Respuesta y tiempo:** headers <=8 KiB, body <=64 KiB, response generado <=4 KiB, JSON/UTF-8 estrictos; `done:true`, modelo esperado y JSON interior exacto answer=4, sin campos adicionales. Formato/resultado inválido o truncado -> error tipado sin eco del body. Plazo absoluto único incluye preflight, envío y lectura (30 s por defecto, 1–120000 ms configurables); cancelación/timeout directos con cleanup y protección HTTP101/close de B05-01. El límite num_predict es del servicio, no sustituto de límites de bytes/tiempo del cliente.
- **Efectos y errores:** lectura previa/denegación sin inferencia; desde que se envía POST puede haberse consumido cómputo. Exponer si hubo despacho y distinguir resultado confirmado de terminación sin resultado confirmado; cancelación/timeout/RST tras despacho no prueban que el servidor se haya detenido. Sin retry/fallback, descarga, limpieza o reejecución automática. Mantener errores de probe existentes; errores específicos tipados para permiso/modelo/output/timeout/cancelación, estáticos/sin causas o payloads privados. No integrar EventStore/scheduler ni prometer exactly-once.
- **Reutilización/componentes:** paquete packages/ollama; añadir src/inference.ts y tests desde exports dist; src/index.ts reexporta API, CLI añade preview/run explícitos. Compartir sólo el transporte privado necesario (posible src/http.ts) para las tres rutas fijas de B05-01/02: mismo agente privado, veto proxies/redirects/DNS, parser estricto, límites, settlement/abort/close/upgrade. Sin cliente HTTP público/genérico, duplicación de getJson, SDK ni dependencias nuevas salvo necesidad demostrada. Ningún contrato de Fases 01/02 cambia.
- **Privacidad y alcance excluido:** clasificación única synthetic-public-v1; preview fijo visible al operador, nunca prompts libres/respuestas crudas en logs, errores, CAS o ficheros. Resultado del modelo no es instrucción ni permiso. Sin secretos, ContextEnvelope/Package, agentes, routing, registry genérico, RAG, dashboard, servicios cloud o descargas. D-036 no implementa redacción ni autoriza otros payloads.

### Tests y criterios de aceptación B05-02

1. Mocks HTTP locales con guard runner/CLI: preflight y un único POST permitido, bytes/método/ruta exactos; ninguna otra ruta, inferencia o descarga. Preview puro determinista, hash del body real y límites UTF-8; sin red en preview.
2. Grants ausentes/false/heredados/getters/Proxy, destino/modelo/hash distintos o preview manipulado -> error tipado y cero POST (denegación inicial: cero tráfico). Revocación entre preflight/despacho y antes de devolver resultado, sin autorizar por CAS/preview.
3. Modelo ausente/no autorizado/cloud -> ningún POST. Mocks de instalación vacía/cambio de inventario; no fallback/download. Las comprobaciones HTTP no prueban integridad frente al dueño del servicio; documentar la frontera confiable.
4. Respuesta válida answer=4, JSON exterior/interior malformado, modelo inesperado, done:false, UTF-8 inválido, exceso de body/texto, truncado, HTTP error/101/redirect, close/RST, timeout/cancelación incluso con destroy silencioso. Un solo settlement, recursos liberados, errores sin contenido sensible; ningún retry tras despacho incierto.
5. CLI compilada preview/run con autorización explícita y JSON/exit tipados contra mocks; registro de errores/procesos sin prompts o respuestas crudas. Conservar 519 tests previos; frozen/peers/formato/lint/typecheck/build/tests/diff/secretos con Node 24.19.0 estable.
6. Prueba real **separada y opt-in**, fuera de suite automática/guard de mocks: requiere autorización expresa adicional del propietario al destino, modelo instalado concreto y payload preview/hash. Si falta modelo o entorno estable, documentar demo real bloqueada; nunca descargar para desbloquearla. Este plan/cierre no autoriza ninguna petición real.

**Demo esperada:** preview sintético -> autorización exacta -> preflight de modelo local instalado -> único POST -> JSON validado answer=4; timeout/cancelación sin retry y diagnóstico de despacho. Primero reproducible con mocks y proceso CLI; real sólo con las condiciones anteriores. No pretende demostrar edición de código ni cerrar toda Fase 03.

**Dependencias y rollback:** B05-01 aceptado; Node estable antes de implementar/gates; modelo local/local-only y consentimiento adicional antes de demo real. Riesgos R-063/R-061 y seguimientos RST/SIGINT vigentes; corregir sólo regresiones que impidan los criterios del nodo, sin nueva auditoría general. Revert acotado de B05-02 si falla, conservando contratos/probe/evidencia y sin borrar modelos/datos. Siguiente capacidad: inferencia sintética local supervisada y evaluable; no asignar otro nodo ni avanzar de fase en esta preparación.

Fuentes oficiales de diseño consultadas, sin consultar el servicio instalado: [POST generate](https://docs.ollama.com/api/generate), [local-only](https://docs.ollama.com/faq#how-do-i-disable-ollamas-cloud-features).

## Histórico — correctivo previo a la aceptación

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
