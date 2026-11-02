# Fase 05 — Harness externos

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

Resultado y gates: verdes según evidencia final superior; no aceptación independiente atribuida. Primera suite completa falló por deadline5s del test compuesto; emisión byte a byte con timer1ms sensible al scheduler. Sustituida por setImmediate y deadline20s del test compuesto, sin ampliar timeout5s por proceso. Focal posterior12/12 en1,47s; logs de fallo conservados. No diagnóstico/resolución de R-061.

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
