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
