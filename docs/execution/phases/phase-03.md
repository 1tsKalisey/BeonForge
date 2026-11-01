# Fase 03 — Primer proveedor local

Estado: abierta. Fases 01 y 02 aceptadas/cerradas; D-036 ACCEPTED permanece vigente.

## Primera demostración real autorizada — evidencia registrada

Fuente: autorización expresa de UNA ejecución del propietario y captura del proceso informada en la conversación; este registro no la reproduce ni consulta el servicio. B05-01/B05-02 permanecen cerrados APPROVE_WITH_FOLLOWUPS (`ebbd223`/`593cf8f`, cierre documental `84da472`).

| Dato observado | Resultado |
|---|---|
| Destino/modelo | POST http://127.0.0.1:11434/api/generate; gemma3-hf:1b |
| Payload autorizado | synthetic-public-v1, fixture público fijo de B05-02 (183 bytes UTF-8 sin salto final), SHA-256 `4358bf83c545b0ab2dac053722f342c126280a727db1cfa21f3a06aeb6ef6758` |
| Salida CLI | schemaVersion1, classification synthetic-public-v1, modelo y hash coincidentes, answer4, requestDispatched:true, outcome:confirmed |
| Resultado/exit/stderr | `{"answer":4}` validado según contrato B05-02; confirmed; exit0; stderr vacío |
| Tiempo observado | 74,31 s totales del proceso; timeout autorizado120 s; sin timeout/unknown. Medición inicial de UNA muestra, no SLA, defecto bloqueante ni aislamiento de tiempo de carga/generación. |
| Evidencia HTTP pasiva | Tramo nuevo del log del servidor: dos GET (/api/version, /api/tags) y un POST /api/generate, todos200. No se deriva el contador de exit0. |
| Ejecuciones/efectos | Un lanzamiento del comando aprobado, cero reintentos; árbol Git limpio al terminar. Sin descargas, modificación de modelos/configuración, contexto privado u otros comandos de inferencia efectuados por el agente. |

Límites: la CLI no expone contador de POST. Se observó **uno** en la ventana del log, sin ID de petición correlacionado a ese proceso ni captura de paquetes; no afirmar at-most-once global/exactly-once, ausencia de otros clientes o auditoría exhaustiva del SO. La autorización concreta quedó utilizada administrativamente: no autoriza otra inferencia, aunque el grant de software sea reutilizable. No se copian logs completos, prompt repetido ni respuesta cruda. Real-inference.mjs no se utilizó; se empleó la CLI con timeout explícito120000ms conforme al procedimiento.

## Matriz vigente — criterios globales Fase 03

Se conserva literalmente el gate del master-plan: **«Registry, probes y Ollama candidato evaluado con salida estructurada y cancelación»**, dependencias **«02, clasificación de datos, política, evals»**. No se exige ahora un framework general ni un benchmark nuevo; se evalúa el alcance local sintético aprobado. Esta matriz no redefine el criterio ni convierte una demo en salida completa de fase.

| Criterio / fuente vigente | Evidencia existente | Estado | Bloqueo real |
|---|---|---|---|
| Dependencia Fase02 | Cierre propietario D-036, B03-01–05 cerrados, contratos/worktrees/contexto preservados. | cumplido | Ninguno para escenario sintético; datos privados continúan sin autorización. |
| Probes (master-plan03) / B05-01 | Nodo aceptado, metadata GET con permisos/loopback/límites; preflight real dos GET200. 77 regresiones de probe, P1 HTTP101 resuelto. | cumplido | No requiere ampliar endpoints/proveedores. |
| Contrato de ejecución sintética / B05-02 | Nodo aceptado, preview/SHA/grant propio destino-modelo-body, preflight/autorización separados, un POST y verificación de respuesta; auditoría153/153 focalizados/20 reproducciones, 595 completos por evidencias/logs. | cumplido | P3 no bloqueantes para este caso, no se reabre nodo. |
| Clasificación de datos y política (dependencias03) | synthetic-public-v1 fijo, sin contexto privado; permiso exacto explícito del propietario, servicio local-only comprobado en preparación, timeout120s y sin retries; binding auditado. | cumplido | Sólo clase/destino/modelo autorizados; no exige motor de clasificación general en este cierre. |
| Ollama candidato con salida estructurada (gate03) | gemma3-hf:1b real: respuesta validada answer4/confirmed/exit0; límites y log pasivo consignados arriba. | cumplido | Evaluación del fixture mínimo, no prueba de utilidad en programación ni de otros modelos. |
| Evals (dependencia03), alcance mínimo aprobado | Caso sintético público versionado en prepareSyntheticInference, predicado answer4 y tests de fallo; un resultado real contrastable contra ese predicado. | cumplido | Una muestra no acredita rendimiento/calidad general; el plan no fija dataset múltiple/SLA que obligue a otro ensayo aquí. |
| Cancelación/timeout y tratamiento incierto (gate03) | API/señal y deadline absoluto, abort/HTTP101/close/unknown sin retry, tests mock de B05-01/02 y auditorías aceptadas. Ejecución real terminó normal antes del plazo. | cumplido | Capacidad cliente cubierta por contrato/mocks; cancelación real/OS SIGINT/parada remota no acreditadas y siguen limitaciones/P3, no requisitos nuevos. |
| Registry de proveedor/modelo (gate03) | Probe lista nombres de tags; metadata/resultado real ahora documentados. No registro funcional de candidatos en packages/ollama ni contratos de proveedor; Map de runtime/runner.ts:256 registra BlockHandler, no modelos/proveedores. | pendiente | **Sí: falta registro mínimo funcional de candidato y vínculo de evaluación**, no sustituible por tabla documental/inventario de Ollama. |
| Salida global de Fase03 | Demo real y gates previos existentes; registry pendiente. | parcialmente cumplido | No preparada todavía para decisión de cierre; no cerrar automáticamente. |

Fuera de esta matriz: Fase04 introduce vertical bugfix sobre fixture (reproducir, rojo, cambio, gates/revisión/rollback); Fase05 introduce harness oficiales Codex/OpenCode, herramientas/permisos/aislamiento y contract tests. No son faltas de Fase03 ni se adelantan. Los P3 de duplicados JSON, endpoint fuera del hash, grants reutilizables, script real30s/SIGINT y R-061/R-065 siguen abiertos; no se convierten en bloqueantes sin ampliar escenario.

## B05-03 — Registry mínimo y evaluación del candidato local

Implementación autorizada expresamente por propietario; sin discrepancias con el gate Registry de master-plan. Sustituye la propuesta inferior, sin redefinir criterios globales ni autorizar cierre de fase.

- Objetivo verificable: registrar/consultar candidatos Ollama explícitos y su evidencia limitada, conservados tras reinicio por referencia CAS.
- Diseño mínimo: snapshots inmutables canónicos v1 en ArtifactStore existente; caller conserva referencia raíz actual, no catálogo mutable/tabla SQL/eventos de bloques ficticios. Permisos propios vivos de lectura/registro/evaluación con allowlist de identidades exactas. Registro/evaluación no autorizan metadata HTTP ni inferencia.
- Archivos: packages/ollama/src/registry.ts y exports, tests/fixture de evidencia saneada/demostración de proceso, README; dependencias sólo workspace contracts/persistence ya presentes (tipos, referencias y pruebas reales de CAS). Documentos de ejecución/cobertura/riesgos/revisión.
- Incluido: identidad proveedor/endpoint/modelo/digest declarado, alta/listado/evaluación, duplicación compatible idempotente/incompatible rechazada, evidencia parcial/contradictoria, recuperación/integridad/permisos. Límites de tamaño/cantidad; snapshot explícito no monitoriza modelos ni autentica al propietario del CAS.
- Aceptación/tests: CAS temporal real con worker/reapertura y segundo proceso, esquemas y datos inválidos/duplicados, evidencia gemma declarada y capacidades derivadas sin puntuaciones, permisos/propiedades propias/revocación, referencias corruptas y separación de grants B05-01/02. Guard de red en tests: cero llamadas a Ollama/inferencias/descargas.
- Gates: Node24.19.0/pnpm12.15.0 estables, frozen/peers/formato/lint/typecheck/build/595 anteriores+tests nuevos/diff/secretos. Sin deps externas nuevas ni cambios a contratos aceptados.
- Exclusiones/rollback: no SDK/routing/scheduler/model downloads/UI/harness/nueva evaluación real. Revert acotado de B05-03 preservando blobs/raíces anteriores; no borrar/restaurar datos automáticamente. Snapshot nuevo no sustituye head concurrente implícitamente: caller gestiona referencias/ramas, sin transacciones distribuidas.
- Salida: revisión independiente B05-03; actualizar matriz según evidencia, mantener Fase03 abierta hasta decisión expresa. No Fases04/05.

### Propuesta anterior conservada como trazabilidad

**Registro mínimo del candidato local y su evaluación.** No había un nodo posterior definido; B05-03 es propuesta de nomenclatura siguiente dentro del bloque B05/Fase03, no autorización de implementación. Completar el único requisito funcional pendiente de registry: registrar y recuperar un descriptor versionado de un candidato Ollama explícito (destino, modelo/identidad observada, clasificación permitida, capacidades realmente probadas y referencia a la evaluación sintética existente). Datos no conceden permisos de inferencia; distinguir observaciones en mocks/real y límites de identidad. Reutilizar módulo/persistencia existentes, sin servicio/catalogo genérico, routing ni nuevo subsistema. Aceptación mínima futura: registro/lectura verificables, descriptor inválido rechazado, procedencia/evaluación y permisos no implícitos probados con mocks; ninguna inferencia adicional necesaria para reutilizar esta evidencia. Detallar/aprobar ese alcance antes de implementarlo. No promover el dato documental de esta ejecución a registry funcional ni crear B05-03 en código ahora.

Conclusión actual: **Fase03 abierta por registry pendiente**. Recomendar aprobar/acotar esa única tarea, conservando la demo real existente y sin nueva inferencia ni endurecimientos P3 especulativos. Estado de B05-01/02 no cambia. Este turno sólo documenta/evalúa; no contacto con Ollama, gates repetidos o fases posteriores.

## Cierre vigente B05-02 — APPROVE_WITH_FOLLOWUPS

**B05-02 CERRADO** por aprobación independiente aportada por el propietario, sin P0/P1/P2. Código `ebbd223`, evidencias `593cf8f`. Revisión: **153/153 focalizados y 20 reproducciones independientes**; correspondencia permiso propio/destino/modelo/SHA-256/POST efectivo verificada. **595/595 completos y gates locales** contrastados mediante evidencias/logs, **no ejecutados íntegramente por Claude según este registro**. Node24.19.0/pnpm12.15.0 estables; frozen/peers/check exit0. Este cierre sólo cotejó 13 hashes históricos sin discrepancias y exits, sin repetir suites/auditorías. Demo íntegra con mocks; ninguna conexión a Ollama real/inferencia/descarga/configuración en el cierre.

Cuatro P3 no bloqueantes: JSON.parse acepta claves answer duplicadas (resolver antes de respuestas no sintéticas); SHA-256 sólo cubre body, no endpoint (destino/modelo/hash deben mostrarse y validarse por separado); grants reutilizables/sin caducidad (nunca describir como tokens de un solo uso); script real con timeout30s por defecto y sin SIGINT específico (procedimiento previo obligatorio). R-065/R-061 y seguimientos anteriores continúan abiertos según risks.md. Los estados inferiores pendientes de revisión son históricos.

Fase03 **abierta**: cierre de B05-02 sólo acredita flujo sintético mock, no el gate global de candidato Ollama real evaluado ni registry/evals generales. No nuevo nodo/fase ni autorización implícita de prueba real.

<a id="primera-prueba-real--procedimiento-preparado-no-autorizado-ni-ejecutado"></a>

## Procedimiento de prueba real — autorización previa por intento

Actualización: procedimiento utilizado UNA vez conforme a autorización exacta del propietario, con resultado en el registro anterior. El ancla antigua se conserva para enlaces históricos; ya no significa que la primera prueba esté pendiente. No hay permiso para repetir: cualquier futuro intento requiere otra autorización expresa.

Este procedimiento no amplía las APIs. Usar la CLI existente con timeout explícito; **no usar automáticamente test/real-inference.mjs**: su plazo fijo predeterminado30s y falta de tratamiento específico de SIGINT siguen siendo P3. No se ha cambiado ese script. Todos los pasos de servicio se posponen hasta consentimiento expreso; este cierre no autoriza ni consultas de metadatos reales.

1. **Reunir evidencia del operador**, sin asumir descubrimiento/consentimiento: origen loopback literal completo (`http://127.0.0.1:PUERTO` o `http://[::1]:PUERTO`), servicio/proceso confiable, nombre exacto de modelo instalado con tag y digest/identidad local documentada, y autorización de ese modelo. Verificar local-only **en el servicio activo** (configuración aplicada y evidencia del proceso/log de arranque correspondiente), no sólo una variable del cliente o --local-only-confirmed. Sin alias/retag/cambios de inventario concurrentes. Si faltan datos y requieren consultar Ollama, pedir permiso preparatorio sólo de metadatos; ninguna inferencia implícita. No descargar/reconfigurar para subsanar.
2. **Preparar preview sin red**, desde compilación correspondiente al código revisado y Node24.19.0/pnpm12.15.0 estables. Mostrar al propietario el payload público completo canónico que genera prepareSyntheticInference (2+2/answer4, stream:false, format:json, opciones temperature0/num_predict64/num_ctx1024), su SHA-256 UTF-8, **endpoint y modelo por separado**. Hash no incluye destino y no concede autoridad. Si el payload/modelo/destino cambia, invalidar esta aprobación administrativa y solicitar otra; no reutilizar un consentimiento distinto.
3. **Acordar plazo de carga en frío explícito**, incluyendo preflight: entero ms dentro de 1–120000 admitido por la API. Ejemplo de presupuesto máximo actual: 120000 ms; el operador debe aprobar que es adecuado para ese modelo/equipo, no se presume éxito de carga. Si no basta, no ejecutar ni elevar límites automáticamente. No precargar con un segundo POST ni hacer ensayo de inferencia para calcular el plazo.
4. **Obtener autorización expresa de una sola invocación**, con valores concretos: endpoint, nombre/tag/digest del modelo instalado, payload completo/SHA-256, clasificación synthetic-public-v1, local-only activo verificado, timeout aprobado, permiso a dos GET preflight y a **un** POST generate. Registrar responsable/autorización y que está pendiente/consumida administrativamente para esa invocación. Los grants del software **se pueden reutilizar y no caducan**; el límite de una ejecución es procedimental, no una garantía técnica ni un token consumible. Si el proceso previo quedó unknown, no autorizar un retry implícito.
5. **Sólo tras esa autorización**, un único lanzamiento manual, desde raíz, sin bucles, tareas automáticas o políticas de retry. Plantilla documental no ejecutada (sustituir cada marcador por los valores aprobados; no constituye consentimiento): `node packages/ollama/dist/cli.js infer run --endpoint ENDPOINT_APROBADO --model MODELO_APROBADO --payload-sha256 HASH_APROBADO --allow-local-probe --allow-inference --timeout-ms PLAZO_APROBADO`. La CLI valida instalación/consentimiento y realiza el único POST; no usar el script real de 30s como fallback. Cancelación: usar manejo existente de CLI si se necesita, registrar interrupción y límites de SIGINT Windows; no prometer que Ctrl+C detiene el servidor ni que el script real maneja la señal como la CLI.
6. **Registrar sólo resultado saneado en evidencia privada del operador**: autorización/revisión de código, versiones, endpoint/modelo/digest/hash/plazo aprobados, hora de intento, exitcode, reporte validado o error tipado, requestDispatched/outcome. No prompt/respuesta cruda/thinking, credenciales ni logs completos del servicio con datos ajenos; el payload público aprobado puede constar en el acta de consentimiento, no en logs generales. Éxito exige answer4, modelo/hash coincidentes y outcome confirmed; salida0. Unknown/exit2, timeout, RST, cancelación o corte sin reporte final: no repetir ni inferir que el servidor paró; dejar intento incierto y esperar decisión expresa/reconciliación externa. Not_dispatched no autoriza retry automático; cualquier nueva ejecución necesita nueva aprobación administrativa.

Estado: valores autorizados/resultados de la primera ejecución consignados arriba; consentimiento administrativo utilizado sólo para ese intento, no un permiso vigente para repetir. Este registro no consulta el servicio ni ejecuta de nuevo el comando. Próximo mínimo propuesto B05-03/registry pendiente de acotar/aprobar, sin iniciarlo ni adelantar Fases04/05.

## Estado vigente — aceptación independiente B05-01

**B05-01 CERRADO**, veredicto **APPROVE_WITH_FOLLOWUPS** aportado por el propietario. Claude confirma resuelto el P1 HTTP101 de `4e00fea`; R-064 resuelto y no bloqueante. Evidencia previa: **519/519** tests y gates locales, contrastados mediante logs/exit codes/hashes; **no se afirma que Claude ejecutara la suite completa**. En este cierre se verificaron 37 hashes, sin discrepancias, y exits de frozen/peers/check/final-format/lint/typecheck/guard-final=0; no se repitieron pruebas ni auditorías. Logs: `%TEMP%/beonforge-b0501-p1-afad27ab2d074169850331efbcd70bf3/`. Registros siguientes de REQUEST_CHANGES/pendiente son históricos, sustituidos por esta aceptación.

Seguimientos no bloqueantes: clasificación de RST y errores inesperados, cobertura CLI SIGINT/otros errores, R-061 no reproducida/sin causa identificada (no resuelta). R-063 y riesgos previos siguen vigentes; loopback no autentica al servicio. Fase 03 no completada.

Entorno requerido para continuar: **Node 24.19.0 instalado en ubicación estable fuera de %TEMP%**, con versión/binario/ruta efectiva comprobados antes de gates. La evidencia portátil previa sigue válida como histórica, pero %TEMP% no es dependencia operativa aceptable. No se instala, mueve ni cambia versión, PATH o herramienta automáticamente en este cierre.

## B05-02 — Primera inferencia local sintética autorizada

**Estado: CERRADO — APPROVE_WITH_FOLLOWUPS independiente**, código `ebbd223`, evidencias `593cf8f`; sin permiso de inferencia real. 153/153 focalizados/20 reproducciones independientes y 595 completos por logs/evidencias, sin atribuir suite completa a Claude. Node24.19.0/pnpm12.15.0 estables, fuera TEMP; no herramientas modificadas en cierre. No habilita Fase04 ni cierra Fase03. Alcance original siguiente conservado; cuatro P3 vigentes y procedimiento real anterior no autorizado.

- **Objetivo:** una única inferencia local explícitamente autorizada, verificable y cancelable, sobre un prompt sintético público fijo: solicitar JSON `{ "answer": 4 }` para `2+2`. Sin entrada libre, ContextPackage, instrucciones del operador, código privado, filesystem o CAS.
- **Interfaces propuestas mínimas:** `prepareSyntheticInference({ endpoint, model }) -> SyntheticInferencePreviewV1` puro/sin red: payload UTF-8 canónico fijo, SHA-256 de todos los bytes que se enviarán y límites/política v1. `runSyntheticInference(preview, grant, { timeoutMs?, signal? }) -> SyntheticInferenceReportV1`. Preview y hash son datos, nunca autoridad. Report sólo contiene veredicto validado/answer=4, modelo y hash; no devuelve texto libre ni thinking.
- **Autorización:** grant vivo del caller, no serializado como permiso: propiedades propias de datos `canInfer: true`, `allowLocalProbe: true`, `endpoint`, `model`, `payloadSha256`. Rechazar herencia, accessors, Proxy y objetos malformados con códigos sanitizados. Validar coincidencia exacta con bytes/opciones/modelo/destino, inicialmente, antes del POST y antes de devolver resultado. Revocación previa al despacho impide POST; señal permite cancelar en curso. El permiso de metadata B05-01 no autoriza inferencia ni viceversa; el grant declara ambos explícitamente para preflight. No copiar permisos en un snapshot que ignore revocaciones posteriores.

  Límites confirmados en revisión: grants reutilizables/sin expiración; un POST es por invocación, no por vida del grant. SHA-256 identifica los bytes del body, excluye endpoint; el consentimiento siempre valida separadamente destino, modelo y hash. JSON.parse no detecta claves answer duplicadas; no afirmar validación libre de duplicados ni generalizar a respuestas no sintéticas antes de corregir ese P3.
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

### Evidencias B05-02 — implementación y demo mock

`ebbd223`: src/http.ts extrae y extiende sólo transporte privado de tres rutas, src/probe.ts conserva API B05-01 y añade preflight interno vivo; src/inference.ts implementa preview/canonicalidad/grant/estado de despacho/resultados. Barrel src/index.ts preserva exports y añade interfaces; CLI infer preview/run con flags propios/hash exacto y exitcodes según outcome (unknown=2, otra cancelación=130, fallo=1, éxito=0). README documenta límites y confianza. Sin dependencias/lockfile ni contratos Fases01/02 nuevos/modificados.

**595/595**, sin fallos/skips: contratos62 + persistencia115 + runtime71 + workspace187 + Ollama153 (77 anteriores, 76 nuevos) + spike7. Conserva referencia519, añade76. Node24.19.0/SQLite3.53.3, pnpm12.15.0 estables; frozen/peers/check exit nativo0, formato/lint con tipos/typecheck/build/tests/diff/secretos verdes. Workspace637.68s, Ollama2.55s; focal previa153/153 (2.34s). Typecheck/lint iniciales detectaron sólo ajustes de autoría/casts de pruebas y const/import/assertion, corregidos antes del gate. R-061 no reproducida/no resuelta.

| Criterio | Evidencia verificable |
|---|---|
| Preview exacto/sin red | inference.test.ts: canonicidad y SHA-256 independiente, bytes reales POST iguales al payload; frozen/limits y claves arbitrarias/getters/rehash privado rechazados, sin red inicial. |
| Permisos/modelo | Propiedades propias/false/heredadas/Object.prototype/Proxy/getters/null; grant endpoint/model/hash incorrectos; modelo ausente/cloud/ambiguo y longitudes. Revocación en tags y al recibir resultado, preview alterado durante preflight; cero POST antes de permiso válido. |
| POST único/privacidad | Servidor registra dos GET metadata + un POST exacto; ningún prompt/contexto libre, Cookie/credencial o salida thinking. Report sólo answer4/hash/modelo/clasificación; ninguna ruta de descarga/fallback ni retry. |
| Integridad/límites | JSON exterior/interior malformados/shape incorrecto/model/done inválidos, extra inner fields, UTF-8 inválido, headers por helper previo; 64KiB outer exactos y excesos, generated4096/4097 bytes, maxmodel256/257 y texto Unicode denegado. |
| Tiempo/efectos | Deadline total que incluye preflight, antes/después POST, transporte POST silencioso al destruir, cancelación antes/en body, HTTP101/302/500/cierre prematuro. Outcome not_dispatched/unknown/confirmed y recursos cerrados, sin retry; errores tardíos guardados. |
| CLI/demo | Proceso CLI compilado preview sin red -> consentimiento/hash coincidentes -> preflight -> único POST -> answer4 confirmado. Ausencia de flags/wronghash/timeout no decimal, 101/timeout exit2 con unknown; output inválido exit1 confirmado. Sólo mocks con guard pre-DNS/11434 vetado. |

test/real-inference.mjs separado, sin auto-descubrimiento de tests y NO ejecutado; exige autorización expresa/--local-only-confirmed/endpoint/modelo/hash. No peticiones a Ollama instalado, pesos/modelos nuevos ni inferencia real. Demo real no autorizada en esta tarea: ninguna afirmación de evaluación de un modelo real. Sin estado durable/garantía de autenticidad del servicio; límites R-065 y previos conservados.

Logs nativos/exit codes/hash en `%TEMP%/beonforge-b0502-aa8972a871874846bc64fef4f8882e7f/`; runtime fuera TEMP. Código/test dist actuales, main e14cfdd intacta, sin merge/publicación. Siguiente gate exclusivo: revisión independiente B05-02 por propietario; no B05-03/Fase04 u otra funcionalidad.

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
