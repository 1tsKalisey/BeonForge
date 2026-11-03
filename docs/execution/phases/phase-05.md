# Fase 05 — Harness externos

## B04-01c.2 — CLOSED / ACCEPTED — APPROVE_WITH_FOLLOWUPS

Auditoría independiente APPROVE_WITH_FOLLOWUPS (2026-11-03). F1 y F3 cerrados (external es permission gate, no despacho real). F2 abierto y obligatorio antes de usar bytes externos; no bloquea el generador en proceso. F4 informacional: `attemptId: '1'` en la inspección depende de `retryFailed` deshabilitado. El JSONL sintético es un subconjunto propio, no el formato oficial completo de Codex. c.1 global y c.3 siguen BLOCKED; requisitos de c.3 sin cambios. Detalle en status.md y risks.md.

## Histórico — B04-01c.2 implementado, revisión pendiente

Implementación completada: `packages/runtime/examples/codex/jsonl-parser.ts` (parser JSONL estricto, fail-closed), `packages/runtime/examples/codex/adapter.ts` (adaptador simulado con WeakMap, sin CLI real) y `packages/runtime/test/codex-adapter.test.ts` (~40 tests: unitarios de parser, preparación/grant, ejecute/recuperación, seguridad negativa). Ejecutor exclusivamente en proceso, sin subprocess, sin red, sin credenciales. D-047 registra independencia respecto de c.1 global. Gates pendientes; cierre condicionado a revisión independiente suministrada por propietario. c.3 BLOQUEADO hasta confinamiento efectivo, terminación verificable del árbol, cadena ejecutable verificada, proveedor/credenciales/destino/política autorizados y revisión de c.2 aceptada.

## B04-01c.1b — CLOSED / ACCEPTED — APPROVE_WITH_FOLLOWUPS (control directo sintético únicamente; c.1 global sigue BLOCKED)

P1-1 confirmado: la sonda anterior confundía Jobs implícitos de libuv con terminación por MXC. Atribución retirada; descendientes Node detached y fixture nuevo CreateProcessW sin Jobs propios. Helper Windows C#/.NET con APIs Win32: creación suspendida, asociación/comprobación antes de reanudar, Job no heredable/sin breakaway/KILL_ON_JOB_CLOSE, pins de ejecutables y tests sintéticos. No launcher de producción ni agente autorizado. Código/pruebas **b9c61c3** sobre add2457. Gates: frozen (tras permiso lock store), peers y check exit0 (**739/739**); validación final posterior:28 focalizados y runtime completo **167/167**, lint/typecheck/formato exit0. La evidencia detalla la colección anterior de check y su repetición final, sin ocultar resultados intermedios rojos.

**A. Ciclo de vida Codex/MXC: BLOCKED.** Subescenario directo sintético PASS (normal con limpieza por launcher, cinco forzadas <=500ms, muerte launcher y Jobs anidados). Baselines sin Job dejan hijo/nieto vivos; limpieza por handles separada. MXC no arranca en el ejecutor actual, con o sin Job: `native MXC is unavailable on this executor`. No compatibilidad/cadena efectiva completa/cierre MXC demostrado.

**B. Confinamiento integral del anfitrión: BLOCKED.** Job no aísla FS/red ni creación mediante servicios/brokers externos. No inferencias, credenciales, tráfico a proveedores, setup global, cambios a main/push/merge ni c.2/c.3. Identidad CLI0.166.0/hash anterior confirmados; code-mode-host pinneado no equivale a uso observado. Vault ausente. Detalle, límites, reproducibilidad, gates y rollback: [evidencia c.1b](../reviews/b04-01c1b-evidence.md). Siguiente paso exclusivo: revisión independiente suministrada por propietario, sin cierre automático.


## Histórico c.1 — implementación original / atribución normal retirada por P1-1

Implementación **be0f165** sobre base509c118; comparar `git diff 509c118..be0f165`. Rama preservada, main intacta. Codex CLI0.166.0/hash anterior verificados. Sólo diagnóstico oficial MXC con programas sintéticos fijos, CODEX_HOME/LOCALAPPDATA/TEMP/config privados nuevos, analytics desactivado, sin configuración global. No codex exec, modelo, credenciales, API remota, repositorio objetivo o c.2/c.3. Vault complementario ausente.

Observado: controles positivos FS y denegación de lectura/escritura fuera del ámbito; loopback sintético denegado frente a control positivo del host; la atribución de terminación normal a MXC queda RETIRADA por P1-1 (Jobs implícitos de libuv); ese resultado no prueba control del árbol por MXC. Al terminar Codex forzosamente, descendientes siguen vivos a500ms; desaparecen por autoexpiración4s, limpieza confirmada por separado. No garantía de cancelación del árbol. Frontera del host CLI/herramientas del agente y red externa NO demostradas. **readyForAgent:false**. Siguiente paso: revisión independiente de c.1 y decisión acotada sobre bloqueos; no avanzar a c.2.

Objetivo/alcance c.1: medir únicamente identidad, sandbox de comandos y ciclo de vida; archivos examples/codex, test/codex-preflight.test.ts y tsconfig.test. Sin contratos públicos/dependencias nuevas, sin helper nativo. Criterio PASS global NO satisfecho por dos bloqueos observados/no demostrados; implementación de diagnóstico no equivale a aceptación del nodo.

Límites:10s/64KiB por stream y1s cierre del launcher; ventana500ms cancelación/1000ms normal anterior al plazo conservador de autoexpiración. Raíces temporales físicas nuevas, rechazo links/rutas no canónicas, argv/env fijos sin shell anfitrión. Sólo sentinelas públicos y conexión127.0.0.1 a puerto propio efímero, no red externa. Riesgos del propietario/host confiable persisten. No probar credenciales leyendo archivos reales.

Evaluación Job Objects: fallo demostrado de cancelación justifica estudiar control específico, pero Job alrededor del host no prueba membresía previa de cargas creadas por helpers/brokers MXC. Faltan compatibilidad jobs anidados, asociación antes de ejecución y lifecycle; tampoco resuelve frontera host/FS/red. No añadir infraestructura especulativa ni asignar PIDs retroactivamente como garantía. Mantener BLOCKED, no fallback full access.

Rollback: revert acotado de implementación/documentación conservando informes y raíces privadas; ninguna limpieza destructiva automática ni retry del agente. Revisar código, hechos y límites independientemente; c.2/c.3 sin iniciar.

Node24.19.0 estable/pnpm12.15.0; frozen, peers y check exit0. Suite completa **734/734** (contratos62+persistencia115+workspace187+runtime162+Ollama201+spike7), incluidos23 nuevos. Fuente final de probes13:56:26 anterior a colección runtime14:05:43; lint/typecheck/build/formato y23 focalizados repetidos después con exit0. Logs completos stdout/stderr/exits y hashes privados: `%TEMP%/beonforge-c1-0e1812f7df284526b296f4ee0a10063c/`. Diff/staged paths y escaneo heurístico de secretos verificados sin hallazgos. Índices privados source-sha256.txt/evidence-sha256.txt permiten contrastar fuentes y logs; no subir SQLite/CAS/logs. No ejecución atribuida a Claude. R-061 no reproducida ni resuelta.

Informe final CAS SHA-256 `df9e1f45628a216e36b84cff7195cdfda83b8b0caf1863d227b61b1be352f421`,1765 bytes; reapertura SQLite y lectura/verificación byte a byte desde segundo proceso exit0. Diagnostic CLI exit2 significa BLOCKED registrado correctamente, no gate fallido. Hash binario `9d563ee4e0441ff9d59d612013e0460ddf8e5709735c2d9f6b98b7ef8ca4eb42`; perfil `1593da9669756a2c557fd0b3d6aad89d094d8f6a2ab000e92cdefb06903320a7`; programas `d40df0fd68e84741c6b872133c075344e5206c94af1cb01e93c160ec2bbb5885`.

## Histórico previo a B04-01c.1

Gates de este cierre documental: Node24.19.0/pnpm12.15.0, `pnpm.cmd install --frozen-lockfile`, peers y format:check exit0; diff/alcance/escaneo heurístico de secretos verdes. Sin nuevos lint/typecheck/build/tests funcionales: sólo7 Markdown,711/711 es evidencia previa. Inspección Codex version/help exit0, sin agente/sandbox setup/credenciales. Logs/exits/metadata/hashes privados en `%TEMP%/beonforge-b0401b-close-888135c0caf44f9e8df7cbee801bf4f7/`. Este cierre no prueba confinamiento efectivo ni autoriza c.

## B04-01c — vertical Codex propuesta, NO INICIADA

Objetivo: tarea → Codex CLI oficial → propuesta → validación → tests → diff → revisión pendiente. Sólo planificación, sin despachar agente. Reutilizar kernel, EventStore/ArtifactStore, contratos, worktrees y contexto. No modificar supervisor simulado aceptado salvo defecto bloqueante. Codex es primer ejecutor, no destino final: API/Angular, OpenCode/routing y multiagente siguen D-046.

### Inspección local no invasiva

CLI npm: **codex-cli 0.166.0**, confirmada por binario con `--version`; `exec --help` exit0. Binario: `%APPDATA%/npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe`. SHA-256 **9d563ee4e0441ff9d59d612013e0460ddf8e5709735c2d9f6b98b7ef8ca4eb42**. Shims npm detectados, no utilizarlos como shell. Hash local no autentica distribución: revalidar ruta canónica/identidad/hash antes de uso. Aplicación Appx26.1027.3384.0 distinta de versión CLI npm.

Sólo version/help, binario directo sin shell, timeout10s/salida64KiB, cwd/CODEX_HOME privados vacíos y entorno mínimo sin tokens. No agente, login/auth-status, listado de modelos o lectura de archivos de autenticación. Help local acredita json/output-schema/ephemeral/ignore-user-config y sandbox read-only/workspace-write; advierte que ignore-user-config no desactiva autenticación de CODEX_HOME. No heredar HOME/configuración personal para el adaptador.

Windows11 Pro25H2 **26200.9711** cumple mínimo de build documentado para MXC, pero **disponibilidad, activación y perfil efectivo NO comprobados**. No se activó sandbox, característica, cuenta, ACL o firewall; la configuración de este chat no prueba confinamiento de BeonForge.

### c.1 — Preflight y frontera efectiva, sin proveedor

Entrada: binario/version/hash explícitos, perfil soportado, raíces privadas nuevas/sentinelas sintéticos y límites. Salida CAS: hechos observados, perfil efectivo/controles probados o **blocked**, nunca permiso de inferencia. Preferir sandbox oficial MXC cuando se demuestre compatible; no fallback automático a full access/unelevated. Verificar por separado CLI anfitrión y comandos/hijos. Read-only/cwd/HOME no deniegan por sí solos herramientas o lecturas ajenas.

Probes inocuos locales: negar lecturas/escrituras fuera de raíces, red de herramientas y herencia de credenciales; sin otros proyectos ni modelo. Denegar shell, MCP, skills/plugins, subagentes, web y Git del agente mediante política soportada comprobada, no por prompt. Si el sandbox protege sólo comandos y no al host CLI, blocked: decisión específica antes de añadir un entorno aislado, no infraestructura automática.

Terminación: prever launcher Windows específico Codex con Job Object kill-on-job-close, proceso suspendido/asignado antes de reanudar, handles no heredables/breakaway deshabilitado y compatibilidad con jobs anidados/MXC probada. Helper nativo mínimo sólo si interfaz oficial no cubre la garantía: necesidad concreta P3-4, no framework. Job no es sandbox FS/red ni evita todo lanzamiento mediante brokers: prohibir esas rutas o blocked. Memoria/CPU a nivel job sólo si efectivamente configurados/verificados; heap V8 no limita RSS.

Aceptación: hijo/nieto sintéticos terminan al cancelar/perder launcher/supervisor; fallo de asignación no permite despacho; sentinelas demuestran controles. Cualquier setup OS/cuentas/ACL/firewall/instalación requiere aprobación concreta. Versión/hash/perfil distinto invalida informe. Sin prueba de confinamiento efectivo, ninguna ejecución real.

### c.2 — Adaptador estrecho y evidencia, implementación sólo con mocks

Proponer funciones locales preparar preview/ejecutar una vez/inspeccionar; no contratos públicos nuevos sin necesidad. Grant propio vivo liga run/intento, binario/perfil, proveedor/destino/modelo, payload/hash, raíces/operaciones/límites. Entrada por DTO/bytes controlados: no confiar en objetos arbitrarios que ejecuten valueOf. ContextEnvelope se lee con permisos actuales, instrucciones separadas de contenido; referencia CAS no autoriza envío.

Binario nativo, argv fijos y stdin, entorno allowlist/config privada; sin shell/npm shim/IPC Node/lifeline del fake, auto-approval o bypass. Preparar comando exacto sólo tras c.1 y elección autorizada de modelo. Una ejecución activa, start durable antes de efecto, sin resume/retry automático. Salida oficial exec/json no concede permisos ni acredita tests. Propuesta final con schema mínimo: commit, src/add.ts, SHA de preimagen y reemplazo UTF-8; agente sólo propone.

Validación incremental UTF-8 fatal/JSONL, schema/eventos admitidos, duplicados/campos extra, línea incompleta y final estructurado. Rechazar desconocidos, no ejecutar texto. Persistir únicamente estados/resúmenes saneados/contadores y refs CAS, nunca razonamiento, credenciales o streams crudos. Sin parser universal de agentes.

Límites propuestos: contexto16 archivos/16KiB archivo/32KiB total e instrucciones4KiB; stdin64KiB; stdout/stderr1MiB por stream, línea64KiB,4096 eventos, propuesta16KiB; deadline120s (hasta300s sólo autorizado) y cierre5s. Diferenciar cola/ejecución/cierre/SQL; no truncar para éxito. Sin confirmación de árbol terminado o finish perdido, uncertain/pending sin retry, ni garantía de parar cálculo remoto.

Pruebas: mocks de proceso Codex sin proveedor, snapshot/hash/argv, grants inválidos cero spawns explícitos, revocación, chunks controlados UTF-8/JSONL/BOM/duplicados, fronteras/flood, spawn/exit/error/cancelación/timeout/crash y pérdida de confirmación. SQLite/CAS y lector de segundo proceso reales. Archivos previstos bajo `packages/runtime/examples/codex/` y `packages/runtime/test/`, helper Windows sólo justificado por c.1; no SDK/paquete genérico ni cambios al kernel por anticipación.

### c.3 — Primera corrección generada, opt-in separado

Requiere c.1/c.2 aceptados y autorización **nueva, específica y compatible con D-043**: excepción concreta para proveedor/credenciales/envío, manteniendo sólo repo Git nuevo sintético. Identificar endpoints/proveedor/modelo, autenticación oficial/custodia, payload exacto/hash/clasificación pública, binario/perfil, roots/operaciones/límites y una ejecución administrativa sin reintentos. No extraer/exportar tokens ni reutilizar suscripciones como API. Herramientas/tests no reciben credenciales; falta de separación de autenticación/host/herramientas/egress bloquea. No API de pago obligatoria.

Crear Git nuevo con plantillas propias04; registro/commit exacto/worktree/contexto y rojo fijo. Una llamada autorizada genera propuesta sin recibir la postimagen conocida. Supervisor valida commit/preimagen/allowlist y postimagen sintética admisible antes de aplicar/ejecutar: es gate, no generador. Revalidar permisos/identidad/estado; aplicar sólo src/add.ts, test fijo verde, diff de un archivo, refs CAS de resúmenes de tests y reapertura. Original/metadatos/store fuera de permisos del agente, sin scripts arbitrarios/instalaciones.

Gate final: propuesta real autorizada → verde/diff/evidencia recuperable → review pending/integration not_performed. Drift/incertidumbre bloquean. Sin merge/push/rollback automático ni identidad humana autenticada fingida. Opt-in real nunca entra en gates automáticos. Después: revisión independiente y vertical API/Angular mínima, no UI/routing/multiagente dentro de c.

### Fuentes y condiciones de avance

Documentación oficial consultada2026-11-02: [Codex exec](https://learn.chatgpt.com/docs/non-interactive-mode), [Windows sandbox](https://learn.chatgpt.com/docs/windows/windows-sandbox), [permisos](https://learn.chatgpt.com/docs/permissions); documentación no sustituye pruebas en host. [Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects) y [límites](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_basic_limit_information): contención/terminación de miembros, no aislamiento de seguridad universal.

Tras autorizar implementación se puede desarrollar c.1 y c.2 sin credenciales, con probes locales aprobados/mocks/persistencia real. Hoy sólo plan. c.3, uso de autenticación/envío y cualquier setup OS requieren autorización expresa adicional; éxito simulado o cierre b no la concede. Riesgos R-057/061/065/066/067 y P3-4/5 siguen abiertos. Rollback futuro por revert acotado conservando evidencia/datos, sin reparar/repetir automáticamente efectos inciertos.

## Histórico previo a preparación de c

## B04-01b CLOSED / ACCEPTED — APPROVE_WITH_FOLLOWUPS

Propietario autoriza expresamente cierre documental conforme a segunda auditoría independiente: P2-1 corregido sin bypass demostrable; P3-1/2/3/6 confirmados corregidos; P3-4/5 abiertos no bloqueantes **sólo para supervisor simulado confiable**. Código de441e3/evidencias e34cc88. Claude ejecutó26/26 focalizados;711/711 globales contrastados por evidencias, no ejecución completa atribuida a Claude. Sin contratos públicos/dependencias cambiados. Fase05 abierta, D-046 y D-043 vigentes; sin permiso de agente real, credenciales, envío, proyecto real o integración.

Seguimientos: Buffer.from/conversión del payload puede ejecutar código del caller mediante valueOf u otros mecanismos: caller confiable sigue siendo frontera (R-067), no deserializador seguro para objetos arbitrarios. Mejorar en futuro aserción de cancelación previa con contador explícito cero spawns. focused.stdout es intermedio, no resultado final: green-final2.stdout acredita26/26 y check.stdout711/711; conservar fallos y filtros históricos sin presentarlos como última corrida. No reabrir código sin defecto bloqueante demostrado.

P3-4 sin escalado de señales/árbol Windows general y P3-5 IPC sin límite de bytes permanecen abiertos. No se transfieren garantías del fixture a Codex: confinamiento de host/herramientas/red, CPU/RSS y terminación efectiva son prerrequisitos de c. R-057/061/065/066/067 siguen abiertos; R-061 no reproducida/causa desconocida/no resuelta. CAS no autentica al propietario, no exactly-once/power loss/liderazgo global ni autenticación humana.

## Histórico anterior al cierre de b

Correctivo **de441e3** sobre base e8d70a6; comparar `git diff e8d70a6..de441e3`. P2-1 corregido localmente, pendiente de verificación independiente; B04-01b NO cerrado/aceptado.

Validación final del correctivo: **26/26 focalizados y711/711 globales** =62 contratos+115 persistencia+187 workspace+139 runtime+201 Ollama+7 spike. Node24.19.0/pnpm12.15.0; frozen/peers/check exit0. Fuente TS final12:06:12/13 anterior a colección runtime12:07:24; lint/typecheck/build globales y formato repetidos para fuente final. Dos evidencias rojas:5 getters/herencia antes del parche y1 contaminación de descriptor antes del endurecimiento; skips de filtros no son suite completa. Logs stdout/stderr/exits/hashes en `%TEMP%/beonforge-b0401b-fix-92d3dfc6ad6749d28b9f89829d15b3b4/`. Sin tests nuevos atribuidos a Claude, sin cierre/aceptación de b ni nuevos bloques. R-061 no reproducida/resuelta; riesgos vigentes. Diff/escaneo heurístico de secretos sin hallazgos.

## Correctivo B04-01b — único alcance autorizado

Objetivo: corregir P2-1 con captura única de datos propios y snapshot estable (mode/payload/límites); preservar grants vivos. P3-1/2/3/6: cancelación previa cancelled persistida, test de uncertain, argv real y estados exactos. P3-4/5 abiertos: sin escalado de señales e IPC no acotado. Archivos funcionales: examples/simulated/supervisor.ts y test/supervisor.test.ts, README; matriz/evidencias en risks.md/current-review-packet.md. Sin API pública, dependencias, fixtures a, runtime/kernel o dominios alterados.

Aceptación local: cinco rojas de getters/herencia antes de cambio;26 verdes incluyendo17 anteriores; full gates finales verdes, diff/secretos/commits de corrección y evidencia separados. Mantener persistencia/reapertura/no redispatch, limpieza del proceso real de prueba y grants denegados sin efectos. Rollback por revert conservando datos. B04-01b abierto para revisión independiente, no nuevo nodo/IPC genérico/Job Objects/red ni Codex real. D-043, D-046 y riesgos vigentes.

## Histórico previo al correctivo de b

Implementación B04-01b: **dd61d13**, comparar `git diff 4389b3f..dd61d13`. Formalización a/D-046:4389b3f. Verificado localmente, ABIERTO para revisión independiente; no aceptación ni siguiente nodo iniciado.

Gates finales B04-01b: **17/17 focalizados y702/702 globales**, sin fallos finales = contratos62+persistencia115+workspace187+runtime130+Ollama201+spike7. Node24.19.0/pnpm12.15.0 estables; frozen/peers/check exit0, formato/lint/typecheck/build/tests incluidos, diff y escaneo heurístico de secretos verificados. Workspace690,88s/runtime563,41s son tiempos de suite, no SLA. Logs stdout/stderr/exits, entorno, fuentes y SHA-256 en `%TEMP%/beonforge-b0401b-561881138bb34d93bbcc5ca1bb05ab96/`. No se atribuye suite a Claude; revisión independiente pendiente, B04-01b ABIERTO. R-061 no reproducida ni resuelta. Código final estabilizado antes de gate completo. Fallos de autoría previos documentados; dist reconstruido desde fuentes actuales.

## B04-01b — supervisor simulado, alcance de implementación autorizado

Objetivo: despacho autorizado de fixture fijo, salida validada, eventos/resultado SQL/CAS y recuperación sin replay. Componentes: examples/simulated/supervisor.ts/README y test/supervisor.test.ts más lector/crash/lifeline de test; tsconfig.test incluye ejemplo. Sin kernel/domain/public exports/dependencias nuevas, patch, agente real, credenciales o repositorio objetivo. Contratos locales al ejemplo; EventStore/ArtifactStore/executeWorkflow reutilizados. Lectura de bytes históricos no concede permiso operativo.

Aceptación: grants propios vivos ligados a run/hash de payload/modo/límites/scripts; pin/paths/argv/env; entrada64KiB, salida64KiB/stream, plazo50..5000ms y confirmación de cierre1000ms, un activo por módulo. Protocolo canónico fijo comparado incrementalmente por bytes; BOM/duplicados rechazados en frontera. Preservar fixture a. Casos válidos/inválidos, fronteras/overflow, permisos/revocación, timeout/cancelación, crash y reapertura real/segundo proceso/pérdida finish, sin reintentos de pending/uncertain.

Límite explícito: Node prohíbe child_process/workers y sólo lee fixture; IPC lifeline termina hijo directo al perder supervisor. No manejo genérico de descendientes Windows, Job Objects, CPU/RSS/egress, sandbox SO/red ni defensa contra host/propietario hostil. Esas ausencias bloquean agentes/código no confiable y no se publicitan como garantías. Heap V8 no es límite total de memoria. Los tests sólo prueban el escenario de procesos conocidos. Detalle operativo en packages/runtime/examples/simulated/README.md.

Plan/rollback: implementar mínimo y17 tests funcionales, gates oficiales completos y revisión independiente. Revert acotado conservando SQL/CAS/evidencias; no borrar, reparar o repetir resultados inciertos. B04-01b abierto, sin aceptación independiente ni siguiente nodo implementado. Primer fallo de autoría de lector nativo por parameter property TS incompatible corregido; errores de tipos de stdio IPC y lint de IPC test corregidos antes de gate final. No R-061 resuelto. Gates completos finales verdes.


Autorización expresa vigente: **B04-01a CLOSED / ACCEPTED — APPROVE_WITH_FOLLOWUPS**; P3-3/4/5 y R-057/061/065/066/067 abiertos. **D-046 ACCEPTED** por propietario: vertical Codex primero, API/Angular parcial tras API estable, OpenCode/routing después y multiagente diferido. No eliminación de capacidades ni permiso de proveedor/credenciales/envío. B04-01b autorizado exclusivamente con fixture simulado; pendiente de implementación/revisión, no aceptación. D-043 intacta. El estado anterior inferior se conserva como histórico.

## Histórico previo a esta autorización

Gates documentales nuevos: Node24.19.0/pnpm12.15.0, frozen/peers/format:check/diff exit0; escaneo heurístico sin hallazgos y alcance sólo7 Markdown. No nuevos lint/typecheck/build/tests funcionales por ausencia de cambios de código/dependencias;685/685 sigue evidencia previa, no nueva ejecución ni suite completa atribuida a Claude. Logs/exits/hashes privados en `%TEMP%/beonforge-b0401a-auditdocs-3a2989e82c0148849c02db0271f1405c/`. Commit inverso documental permite rollback sin alterar datos.

## Propuesta vertical-first — dirección aprobada, secuencia/gates pendientes

Objetivo: tarea → Codex CLI → modificación en worktree sintético autorizado → tests → diff → revisión humana desde interfaz local. Reutilizar kernel, SQLite/CAS, contratos, workspace y contexto. No framework universal, nuevos subsistemas anticipados ni más simulación sin un riesgo concreto que probar.

| Orden propuesto | Capacidad mínima y gate observable |
|---|---|
| 1 | **B04-01b propuesto, no iniciado:** supervisor acotado al perfil Codex, con pruebas de proceso simulado; spawn sin shell/binario y versión verificados, contexto autorizado, grants vivos, límites, cierre/descendientes, JSONL mínimo, errores y evidencia durable. Start antes de dispatch; pending/uncertain bloquean sin retries. Parser/evidencia se incluyen sólo hasta donde los necesite ese efecto, no framework ni eventos duplicados del kernel. |
| 2 | Primer bugfix generado por Codex sobre Git nuevo sintético: rojo, salida del agente validada, modificación sólo permitida, verde, diff/evidencias recuperables y revisión pendiente. Sin integración automática. Prueba real separada requiere autorización específica de credenciales/envío/modelo/destino y confinamiento efectivo compatible con D-043. Mocks no la sustituyen. |
| 3 | API local y vertical Angular mínima: crear tarea para fixture autorizado, lanzar operación autorizada, consultar estado/historial/eventos, mostrar tests/diff y aprobar/rechazar con acción explícita. Validación/autorización en backend, defensa de acceso local/orígenes y persistencia; sin merge automático ni UI ficticia. Gate: flujo completo desde interfaz y recuperación tras reinicio. |
| 4 | OpenCode y routing determinista mínimo: adaptador soportado/contract tests y selección manual o regla simple explicable con grants independientes; sin fallbacks de permisos/envío. |
| 5 | Coordinación multiagente/concurrencia y mejoras avanzadas sólo tras demostrar necesidad, aislamiento e integrador único. |

**D-046 PROPUESTA, NO ACCEPTED:** dividir la salida de Fase05 en primera vertical Codex y ampliación posterior OpenCode/perfiles; habilitar una entrega parcial de API/Fase09 tras API estable y vertical aceptada; diferir routing/Fase06 y multiagente/Fase07 manteniendo sus dependencias. Las filas y gates originales del master-plan permanecen intactos hasta aprobación formal expresa. La dirección aprobada no equivale a aprobar esta reasignación ni eliminar OpenCode del producto.

Imprescindibles MVP: ejecución supervisada verificable, autorización de datos/operaciones, worktree y commit exactos, tests/diff, durabilidad/recuperación conservadora e interfaz de revisión real. Posponibles tras primera vertical: segundo ejecutor, routing automático ampliado, multiagente, RAG/índices, plugins, entrenamiento, métricas avanzadas y dashboard amplio. OpenCode/routing básico siguen objetivos posteriores del MVP, no funcionalidades eliminadas.

Primer bloque para siguiente autorización: **B04-01b — supervisor mínimo del perfil Codex con mocks, sin proveedor real**. Entradas: worktree/contexto explícitos, ejecutable/perfil pinneados y grant propio revocable. Salidas: intento registrado, propuesta/salidas saneadas y acotadas, clasificación conocida o incierta y referencias CAS. Tests: permiso denegado cero spawn, revocación, spawn/exit/stdin/JSONL/UTF8/BOM/duplicados según decisión explícita P3-4, overflow, timeout/cancelación/corte y reapertura sin replay; sentinelas sintéticos y árbol de procesos. No inventar sandbox por flags/cwd: interfaz/configuración efectiva y confinamiento del host/herramientas/red deben comprobarse antes de habilitar ejecución real. Sin autorización para implementarlo en este cierre.

Bloqueos reales: incompatibilidad del ejecutable/perfil, confinamiento no demostrado, política de protocolo ambiguo antes de confiar en él, autorización ausente/revocada, checkout/contexto inválidos o resultado incierto. D-043 actual no permite servicios externos/credenciales reales por el cierre: una futura variante remota necesita decisión expresa compatible y consentimiento concreto. Ningún ajuste del roadmap relaja estas garantías.


## Histórico / evidencia anterior

Evidencia final B04-01a: **12/12 focalizados y685/685 globales** (62 contratos+115 persistencia+187 workspace+113 runtime+201 Ollama+7 spike). Node24.19.0/pnpm12.15.0; frozen/peers/check-final exit0, formato/lint/typecheck/build/tests incluidos. Primera pasada check exit1 conservada por timeout del test nuevo compuesto; corrección de emisión fragmentada/setImmediate y deadline20s de ese caso, sin ampliar timeout5s del hijo. Fuente actual estable en pasada final. No resolución de R-061. Logs completos/exits/hashes en `%TEMP%/beonforge-b0401a-10ac8a0cb977475a91fceb5dd836f65d/`; diff y escaneo heurístico de secretos sin hallazgos. Bloque implementado/verificado localmente, **ABIERTO para revisión independiente**, sin aceptación atribuida ni avance a b.

## Ejecución autorizada acotada — B04-01a

Propietario autoriza exclusivamente fixture determinista y pruebas, no supervisor, Codex, credenciales o proveedores. B04-01a en implementación local; Fase05 abierta, no integración real demostrada. Base ae49512/árbol limpio, Node24.19.0/pnpm12.15.0. No se encontró B04-01_plan_integracion_supervisada.md en checkout: texto aportado contrastado con este plan. Publicación remota no es prerrequisito técnico local y no se realiza.

Desglose: a fixture/protocolo → b ciclo de vida supervisado → c JSONL/evidencia persistida → d vertical sintética → e crashes/recuperación → f paquete global. Cada bloque requiere autorización, pruebas y commit propios; sólo a se ejecuta ahora. El contrato real BlockHandler/HandlerReport/RunReport permanece intacto; JSONL del fake no añade eventos de dominio. Mocks no satisfacen el gate de integración real inferior.

Cuatro condiciones de B04-01a:

1. Validación: entrada v1 con campos exactos, commit SHA-1/SHA-256 y preimagen SHA-256 hex; UTF-8 fatal, JSON/argv/modo inválidos rechazados con diagnóstico estático sin eco. Protocolo local de test started/proposal, sólo src/add.ts y postimagen fija pública.
2. Limpieza de procesos: driver de test usa Node/script canónicos, argv fijos/sin shell, entorno sólo SystemRoot, stdin cerrado, error de pipe observado, timeout5s y maxBuffer64KiB por stream. Espera close; caso wait fuerza terminación a500ms y verifica killed/close. Fake no crea descendientes. No es supervisor general ni garantiza detener árboles arbitrarios.
3. Determinismo: misma entrada → bytes exactos; incluye Unicode y emisión por bytes que divide codepoints/líneas. Postimagen conocida de fixture, no generación por agente. No tiempos/PID/rutas variables en protocolo.
4. Evidencia: entrada64KiB y salida de test64KiB/stream; sólo diagnósticos sintéticos estáticos, sin secretos/razonamiento privado. No CAS/eventos/workspace/patch en a. Límites por línea y parser incremental del harness se implementarán en c, no se atribuyen al driver.

Archivos: test/fake-agent.test.ts y test/fixtures/fake-agent.mjs de runtime, más documentación operativa. No paquete vacío/dependencias nuevas ni repositorio objetivo necesario. D-043 vigente; únicamente código sintético propio. Tests: determinismo/propuesta, fragmentación Unicode, entradas inválidas/límites, argv, fallo de proceso/JSON negativo y espera terminada. Gates oficiales completos y revisión independiente antes de aceptación. Rollback por revert acotado conservando evidencias. No b ni posteriores.

Resultado y gates: verdes según evidencia final superior; no aceptación independiente atribuida. Primera suite completa falló por deadline5s del test compuesto; emisión de354 bytes con setTimeout(1): auditor midió9,67ms de media en Windows, unos3,4–5,3s para el bucle; check.stdout registró5009ms y focal anterior5,59s. Fallo prácticamente determinista por temporización, no intermitencia ni evidencia de R-061. Sustituida por setImmediate y deadline20s del test compuesto, sin ampliar timeout5s por proceso. Focal posterior12/12 en1,47s; logs de fallo conservados. No diagnóstico/resolución de R-061.

Estado: **ABIERTA — sólo B04-01a autorizado; supervisor e integración real pendientes**. Fuente normativa: master-plan, fila05, «Adaptadores soportados de OpenCode y Codex CLI, perfiles y contract tests; Claude Code independiente». Dependencia04 aceptada por propietario; cierre técnico y gates en phase-04.md. Este plan no acredita un adaptador ni autoriza ejecutarlo. D-043 sigue obligatoria, sin proyectos reales, envío, inferencias o credenciales autorizados por el cierre.

## Primer nodo propuesto — B04-01

**B04-01 — Harness mínimo supervisado de bugfix sintético con Codex CLI.** El master-plan asigna B04 al harness de Fase05, pero no existía un nodo desglosado ni phase-05.md. B04-01 es el identificador propuesto para su primera tarea, no un identificador preexistente ni una fase reordenada. No implementado/iniciado. El segundo adaptador OpenCode y los perfiles adicionales seguirán siendo requisitos globales de05: este nodo no cerraría por sí solo la fase.

### Objetivo observable y límites

Una corrección generada por un único agente para la suma del fixture sintético de04, con test rojo previo, contexto explícito verificado, respuesta acotada, parche autorizado aplicado por BeonForge, test verde, diff y evidencia recuperables; **revisión pendiente e integración deshabilitada**. No sustituir la salida del agente por el parche fijo de04 ni presentar mocks como una demostración con agente real.

Reutilizar las plantillas sintéticas de04 para crear un **nuevo** Git local descartable y un worktree detached autorizado. No usar el root manual anterior, BeonForge u otro repositorio existente como objetivo; sin descubrimiento, remotos, instalaciones o datos privados. Original, metadatos Git comunes, worktree, contexto, CAS/SQLite y proceso tendrán raíces autorizadas separadas. La primera respuesta sólo propone reemplazar src/add.ts; test, package.json y .gitignore inmutables. El agente no recibe permisos para ejecutar tests, shell, subagentes, MCP, navegación, Git, merge, push o publicación. Los tests fijos los ejecuta el supervisor, no comandos sugeridos por el modelo.

Para este primer fixture, aceptar únicamente una postimagen sintética admisible y exacta para la función de suma, además de verificar preimagen/base/path/identidades. Esa comprobación es un gate de salida, no el generador del parche ni una evaluación de programación general. No ejecutar código generado arbitrario bajo las garantías limitadas de04. No framework universal, routing, multiagente, UI ni coordinación.

### Selección inicial: recomendación condicionada

| Candidato | Capacidad documentada y límite pendiente |
|---|---|
| **Codex CLI, recomendado primero** | Interfaz oficial no interactiva codex exec, eventos JSONL y salida estructurada; documentación específica de sandbox Windows. Evita introducir un servidor/SDK para este caso. Versión instalada, flags efectivos, desactivación de herramientas, lectura acotada, configuración heredada, autenticación compatible y supervisión de descendientes **no comprobados en este cierre**. |
| OpenCode, posterior | opencode run documenta modo no interactivo, modelo y eventos JSON; permisos granulares de read/edit/bash/external_directory. Son controles de herramienta, no evidencia de sandbox del SO. No se ha verificado su versión/configuración/Windows ni que pueda cumplir el perfil requerido. No habilitarlo automáticamente como fallback. |

Fuentes oficiales consultadas para planificación (2026-11-02), sin invocar CLI:

- [Codex: modo no interactivo](https://learn.chatgpt.com/docs/non-interactive-mode): exec, JSONL, schema de salida y configuración explícita.
- [Codex: aprobaciones y seguridad](https://learn.chatgpt.com/docs/agent-approvals-security): sandbox y política de aprobación son controles distintos; read-only no significa ausencia de comandos o de lecturas ajenas.
- [Codex: sandbox Windows](https://learn.chatgpt.com/docs/windows/windows-sandbox): implementación y compatibilidad dependen del host; no asumir un perfil efectivo por el nombre de una opción.
- [OpenCode CLI](https://opencode.ai/docs/cli/) y [permisos](https://opencode.ai/docs/permissions/): run y reglas de herramientas; los defaults no son una allowlist restrictiva.

La recomendación es técnica, **no aprobación del proveedor ni compatibilidad local demostrada**. No se fija aún un comando real con flags de una versión no comprobada ni se cambia la configuración del sistema. Verificar posteriormente versión/binario, interfaz y perfil efectivo antes de cualquier despacho. Si no puede impedir herramientas/lecturas/egress no autorizados, permanecer bloqueado; no utilizar full access ni un fallback automático.

### Entradas, salidas y contratos mínimos propuestos

- Entrada: tarea pública sintética; intent/receipt del worktree nuevo, commit exacto y ContextEnvelope/CAS existentes; identidad del ejecutable/perfil y modelo explícitos; límites; grant vivo propio del caller ligado a run/intento, destino/proveedor, modelo, hash de payload, refs y raíces/operaciones autorizadas. Registro de candidato, contexto y respuesta nunca otorgan permiso.
- Separar preparación/preview, despacho supervisado y lectura de resultado. Funciones locales propuestas prepareAgentBugfix / runAgentBugfix / inspectAgentBugfix, nombres aún de diseño, sin API genérica ni ampliar contratos de dominio aceptados. Preview incluye bytes exactos y hash, archivos transmitidos, destino y efectos permitidos. Una referencia no concede autoridad.
- Único formato de propuesta de corrección v1: base commit, ruta src/add.ts, hash de preimagen y bytes UTF-8 posteriores limitados; sin comandos. Validar campos estrictos, duplicados/extra/canonicalización según formato elegido. Resultado del adaptador distingue fallo previo al despacho conocido, confirmed, cancelled sólo si verificable y uncertain; exit0/mensaje del modelo no aprueban el parche ni garantizan confinamiento.
- Reutilizar BlockManifest/BlockHandler/HandlerReport/RunReport, EventStore/ArtifactStore/checkpoints, grants propios/revocación, inspección de worktree y build/readContextEnvelope. No modificar el handler fijo aceptado de04 para fingir integración; conectar un ejemplo acotado de05 y un único adaptador separado del dominio. Ubicación propuesta packages/harness (sólo cuando se implemente) más ejemplo/tests sintéticos, sin crear paquete vacío en este cierre.
- Salida: versión/binario/perfil efectivos, hashes/refs de payload y propuesta, límites y estado del intento, tiempos/exit, resultados de tests y **referencias CAS explícitas** a sus resúmenes saneados, diff, pre/post hashes, revisión pendiente e integration:not_performed. Evidencia dependiente del EventStore no se presentará como autenticación independiente.

### Seguridad y secuencia autorizable

1. Verificar binario/perfil soportado y confinamiento con probes sintéticos inocuos y proceso simulado, sin inferencias. Demostrar lecturas/escrituras/red/herramientas denegadas, configuración sin extensiones/MCP/skills/hook heredados, sin perfiles personales montados. Worktree/cwd/HOME y read-only por sí solos no confinan al proceso anfitrión.
2. Crear fixture nuevo sólo tras autorizar implementar/demostrar el nodo; usar workspace/contexto existentes y revalidar identidad/HEAD/estado/grants. Proteger original, metadata Git, SQLite/CAS/evidencias y sentinelas sintéticos fuera de subraíces; no mostrar rutas privadas al modelo.
3. Red fijo previo; payload únicamente instrucciones explícitas separadas de archivos sintéticos seleccionados. Privacidad/exclusión/rechazo antes de persistir o transmitir; D-036 no equivale a redacción ni autorización de envío. El agente recibe sólo ese contexto y no acceso automático al filesystem del usuario. Seleccionar manualmente el único perfil/modelo habilitado, sin routing ni registry implícitamente autorizante.
4. Antes del efecto, autorización propia y revocable del payload/destino/modelo y política de herramientas; inicio durable antes de despacho y evidencia exclusiva de intento. Un solo despacho por autorización, sin resume/retry automáticos ante pending/uncertain o pérdida del proceso/resultado.
5. Invocación sin shell, argv fijos, stdin limitado, entorno mínimo, configuración privada sin credenciales ambientales. Límites iniciales propuestos: entrada64KiB (contexto sigue16 archivos/32KiB e instrucciones4KiB), propuesta16KiB, stdout/stderr64KiB por stream, plazo absoluto120s configurable sólo con autorización hasta300s, una ejecución serial. No SLA, cuotas ilimitadas ni garantía de parar cálculo remoto; kill del árbol y cierre de stdin/sockets con plazo de asentamiento verificable, incertidumbre si no se demuestra.
6. Capturar acotadamente eventos y stderr en memoria; persistir sólo esquema/estado/resúmenes públicos permitidos, no razonamiento privado, credenciales, prompts ni errores crudos. Salida desconocida/excesiva o stream truncado falla cerrado. Eventos/mensaje final del agente son datos no confiables, no autorizaciones ni evidencia de éxito de tests.
7. Validar propuesta/preimagen/postimagen exacta del caso sintético antes de cualquier escritura o test; aplicar sólo src/add.ts mediante supervisor y permiso específico. Revalidar inventario completo permitido y originales: cualquier cambio fuera de allowlist, Git/HEAD/identidad alterados o efecto incierto bloquea sin limpieza. Un diff posterior es detección adicional, no prevención del escape.
8. Test fijo verde, diff y resúmenes con referencias CAS, reapertura desde otro proceso. Presentar revisión pendiente; decisión del caller no autentica humano. No merge/commit/push/rollback automático. Descarte, si se autoriza aparte, sólo postimagen exacta y pruebas sintéticas. Intent de revisión pending tras corte no se presenta como acción reanudable (P3-3 de04).

### Bloqueos reales antes de la primera ejecución con agente

**D-043 prohíbe servicios externos y credenciales reales en las demostraciones actuales.** Codex con servicio remoto necesita una decisión expresa adicional compatible con esa restricción y autorización específica de envío de este payload sintético/destino/modelo. El cierre04 y este plan no la conceden ni reinterpretan D-043. Si se exige mantener cero servicios externos, esa variante permanece bloqueada; un modelo local no se presume alternativa apta ni habilita otro proveedor en este nodo.

Autenticación exclusivamente por mecanismo oficial aprobado; no extraer/duplicar tokens ni reutilizar suscripciones como API, ni añadir una API de pago obligatoria. Antes de cualquier uso de credenciales, resolver cómo mantiene el host la autenticación aislada del agente/herramientas. Falta de separación demostrable bloquea, no justifica montar el HOME real. La red del transporte del proveedor, si se autoriza después, debe distinguirse de la red de herramientas, que seguirá denegada. Lo mismo para lecturas del proceso CLI anfitrión frente a las de sus hijos: un sandbox de comandos no acredita por sí solo aislamiento del host CLI.

Otros bloqueos: interfaz/versión no compatibles, herramientas no desactivables, host sin confinamiento verificable, grants revocados, contexto/commit/identidad no válidos, gate fallido, resultado incierto o postimagen fuera del caso permitido. R-057/061/065/066/067 conservados; P3 previos aceptados no se convierten en nuevas funcionalidades generales. R-061 bloqueará el gate afectado si reaparece. La confirmación histórica de creación no habilita un checkout con drift.

### Pruebas y aceptación del nodo, aún no ejecutadas

- Tests de contrato con proceso simulado escrito para BeonForge, sin proveedores: argv/stdin/perfil exactos, grants propios ausentes/heredados/getters/revocados, hash/destino/modelo incorrectos y cero dispatch inicial denegado.
- Temporales Git nuevos: rojo por bug conocido, respuesta simulada → validación → parche único → verde/diff → pending; original/índice/HEAD/config intactos salvo metadata administrativa autorizada. Rechazar edición de test, archivo extra, traversal/case/links/hardlinks, attrs/hooks hostiles, sustitución de identidad y salida fuera de allowlist.
- Salida/schema/JSONL inesperados, límites, error spawn, stdin cerrado, timeout/cancelación/SIGKILL/descendientes; después de dispatch desconocido no repetir. Reinicio real SQL/CAS desde segundo proceso recupera evidencia o bloqueo; no exigir reparar automáticamente intentos de revisión atrapados.
- Probes de confinamiento sintéticos autorizados: deny-read/write fuera de raíces, red de herramientas bloqueada, procesos descendientes controlados, ninguna configuración personal ni credencial expuesta. Sin pruebas sobre proyectos reales; sentinelas sintéticos únicamente. Si no puede verificarse, el resultado será blocked, no ejecución relajada.
- Gates oficiales del producto completos y revisión independiente del adaptador/perfil. La demostración con agente real es una prueba separada opt-in **posterior a autorización expresa de proveedor/credenciales/envío/confinamiento**: nuevo fixture → bugfix generado, sin postimagen suministrada al agente → test verde/diff/refs → revisión pendiente, sin integración.

El nodo sólo podrá aceptarse como primera integración funcional cuando esa demostración autorizada ocurra con evidencia; mocks o un gate de seguridad bloqueado no cuentan como agente real. Sin permisos adicionales se puede implementar/probar con mocks tras autorizar el nodo, pero no declarar demostrado su objetivo real.

### Archivos, exclusiones, rollback y siguientes dependencias

Propuesta: adaptador/perfil/contratos locales y contract tests en packages/harness, demo sintética separada que consuma las APIs existentes, enlaces workspace estrictamente necesarios y documentación/evidencia. Mantener kernel/domain/workspace aceptados sin cambios salvo necesidad justificada en implementación. No servidor genérico, SDK adicional por defecto, nuevo motor de herramientas, autenticación humana, sandbox propio, routing, multiagente o dashboard.

Rollback futuro mediante commit inverso acotado conservando SQL/CAS/roots de prueba; no borrado/reset/limpieza ni reejecución automática de intentos desconocidos. Siguiente capacidad tras aceptación: primer bugfix generado supervisado sobre proyecto sintético; después, evaluar el siguiente adaptador/perfil exigido por05 y sus contract tests, sin adelantarlos ahora. Fases06/07/09 no iniciadas.
