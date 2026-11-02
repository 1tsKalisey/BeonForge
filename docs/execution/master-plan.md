# Plan maestro de ejecución

Código B04-01a: **d19c10a**, comparar `git diff ae49512..d19c10a`. Verificado localmente, pendiente de aceptación independiente; detenerse antes de b.

Evidencia final B04-01a: **12/12 focalizados y685/685 globales** (62 contratos+115 persistencia+187 workspace+113 runtime+201 Ollama+7 spike). Node24.19.0/pnpm12.15.0; frozen/peers/check-final exit0, formato/lint/typecheck/build/tests incluidos. Primera pasada check exit1 conservada por timeout del test nuevo compuesto; corrección de emisión fragmentada/setImmediate y deadline20s de ese caso, sin ampliar timeout5s del hijo. Fuente actual estable en pasada final. No resolución de R-061. Logs completos/exits/hashes en `%TEMP%/beonforge-b0401a-10ac8a0cb977475a91fceb5dd836f65d/`; diff y escaneo heurístico de secretos sin hallazgos. Bloque implementado/verificado localmente, **ABIERTO para revisión independiente**, sin aceptación atribuida ni avance a b.

Actualización B04-01a: propietario autoriza sólo fixture de proceso determinista y sus tests. Fase05 abierta para ese bloque local, sin supervisor ni integración real; desglose/condiciones en phase-05.md. Fases01–04 aceptadas/cerradas se conservan. No proveedores/credenciales/publicación ni excepción a D-043. B04-01a pendiente de revisión independiente; no avanzar a b automáticamente. El cierre histórico inferior describe la preparación previa de05.

Actualizado: 2026-11-02. Fuentes operativas: `AGENTS.md`, esta memoria de ejecución y `docs/product/software-factory-objective.md`. La especificación complementaria es `knowledge/AI/18 BeonForge Agentic OS/BeonForge Agentic OS MOC.md` y sus 22 documentos, cuya lectura histórica consta en PREP-001. El vault no está disponible en este checkout; no se ha vuelto a auditar. Es de solo lectura y no se incorpora a Git por defecto.

Inspección inicial y herramientas: `docs/execution/preparation-report.md`.

## Resultado y reglas de avance

BeonForge será un plano de control local-first, vendor-neutral, con contratos de bloque versionados, DAG durable, evidencia verificable, recuperación y permisos explícitos. Una capacidad pasa de `catalogada` a `diseñada`, `prototipo`, `verificada` y `producción` sólo con código funcional, contrato, pruebas, documentación, seguridad, observabilidad, demo o evidencia, recuperación y cobertura actualizada. Una fase avanza tras una demo desde entorno limpio y gates satisfechos. Una revisión externa importante pausa el siguiente milestone hasta recibir hallazgos del usuario.

## Arquitectura acordada

- Monolito modular con `domain`, `application`, `infrastructure` e `interfaces`, puertos y adaptadores. El dominio no importa SDKs de proveedores.
- Node.js LTS, TypeScript estricto, pnpm workspaces, Vitest, ESLint, formato uniforme. SQLite WAL para eventos y metadatos; filesystem dirigido por SHA-256 para blobs; Git para versionado. OpenTelemetry al empezar ejecución observable.
- Contratos versionados en toda frontera; eventos append-only, proyecciones reconstruibles, checkpoints, idempotencia y cancelación. Evidencia y políticas preceden a inferencia.
- CLI y API antes de Angular. Modelos, subagentes, routing y entrenamiento sólo después de los prerrequisitos de sus fases.
- Kernel ligero: orquestación, persistencia, estados, recuperación, permisos y coordinación; las capacidades de agente de programación se delegan a interfaces soportadas de OpenCode y Codex. Claude Code permanece como herramienta independiente de revisión, aportada por el usuario.

## Secuencia ejecutable

| Fase | Resultado observable y gate de salida | Dependencias |
|---|---|---|
| 00 Foundation | Repo aislado, workspace estricto, comandos repetibles, CI inicial, ADR, threat model y AGENTS.md | Informe de preparación |
| 01 Kernel durable sin IA | CLI ejecuta un DAG determinista, falla, conserva evidencia, reanuda sin repetir nodos válidos y termina verificablemente | 00 |
| 02 Workspace y contexto | Worktree acotado y ContextPackage reproducible con instrucciones, mapa, exclusión de rutas privadas y rechazo conservador previo a persistencia; sin redacción transformadora ni autorización implícita de envío. | 01 |
| 03 Primer proveedor local | Registry, probes y Ollama candidato evaluado con salida estructurada y cancelación | 02, clasificación de datos, política, evals |
| 04 Vertical bugfix | Workflow sobre fixture: reproducir, test rojo, cambio, gates, revisión y rollback | 01–03 |
| 05 Harness externos | Adaptadores soportados de OpenCode y Codex CLI, perfiles y contract tests; Claude Code independiente | 04 |
| 06 Routing y OmniRoute | Reglas auditables, presupuestos, fallback y shadow; OmniRoute restringido a datos no sensibles | 03, 05, política y evals |
| 07 Subagentes | Delegación contractual, worktrees aislados, integrador único y comparación con agente único | 02, 05–06 |
| 08 Contexto y memoria avanzada | Índice incremental, recuperación evaluada y promoción controlada de memoria | 04, evals |
| 09 Dashboard Angular | Vistas de runs, approvals, artefactos y gates desde API versionada, con accesibilidad y reconexión | API estable |
| 10 Entrenamiento | Dataset lineage, primer LoRA/SFT ante fallo medido, canary y rollback | registry, evals, licencia |
| 11 Plugins | Manifiesto, permisos, instalación deshabilitada, contract tests y retirada | kernel y política estables |

## Dependencias y límites transversales

Estado vigente 2026-11-02: **Fases01–03 CERRADAS / ACEPTADAS**. Propietario aprueba M04.1 y cierre global04 con APPROVE_WITH_FOLLOWUPS (fed1763/8f921c0); **M04.1 y Fase04 CERRADOS / ACEPTADOS (CLOSED / ACCEPTED), gates finales nuevos673/673/frozen/peers/check exit0**. Matriz original sin cambios y evidencia por criterio en [phase-04.md](phases/phase-04.md). Auditoría30/30 específicos y40 reproducciones;673 previos mediante logs/36 hashes y8 fuentes, sin atribuir suite completa a Claude. P3/R-057/061/065/066/067 aceptados sin resolverlos; no revisión humana autenticada/sandbox SO/red/exactly-once/power loss. **Fase05 preparada documentalmente, NO INICIADA**, [B04-01 propuesto](phases/phase-05.md) dentro de B04/harness, sin alterar secuencia ni prometer cierre global con un solo adaptador. D-043 sigue obligatoria; Codex recomendado condicionalmente, ejecución remota bloqueada bajo la prohibición actual de servicios/credenciales externos hasta decisión expresa compatible y autorización específica de envío/confinamiento. Sin agentes, Ollama, implementación05, proyectos reales, merge/publicación o cambios a main.

Los bloques del objetivo son hitos de producto, no sustituyen las dependencias de fase: B00 corresponde a esta reconciliación; B01/B02 al kernel de Fase 01; B03 a Fase 02; B04 a Fase 05; B05 a Fase 03; B06 a la API y Fase 09; B07 a Fase 06; B08 a la coordinación de Fases 01/07; B09 es transversal; B10 agrupa evolución posterior. No se adelantan proveedores ni UI por el orden numérico de los bloques. Entrenamiento, OmniRoute y plugins permanecen diferidos fuera del MVP.

Registro histórico previo a cierres02/03, conservado para trazabilidad (no posición actual): Fase 01/B03-01/B03-02/B03-03 aceptados y cerrados. **Fase 02 sigue abierta**: B03-04 recibe APPROVE_WITH_FOLLOWUPS; P2 de integridad y privacidad corregidos localmente en 18d71dd/8820f3a, **426/426** y gates verdes, sin cierre operativo hasta revisión focalizada. R-047/050 ya revisados en el nodo; case exacto exigido para selección, R-049 global/R-048 parcial siguen abiertos. R-037/038/040/041, privacidad/snapshot R-052/053 y R-054 conservan sus límites. Siguiente gate: revisión focalizada B03-04 aportada por usuario, sin otro nodo iniciado. Sin merge/publicación ni cambios de main.

Cada fase conserva seguridad, threat model, paridad, migración, backup/restore, observabilidad, documentación y cobertura. No se incorporan Nx, Turborepo, NgRx, LangGraph, Temporal, Graphiti, vector DB, Kubernetes o microservicios por anticipación. Repositorios y frameworks citados en el vault son candidatos. Fases 00–01 usan un solo escritor, sin IA de producto, modelos locales, OmniRoute, routing automático ni dashboard.

## Operación por tarea — registros históricos de fases anteriores

Última actualización: revisión focalizada acepta independientemente confirmación/atributos B03-02. Corrección menor stdin local y plan B03-03 preparados; B03-03 no tenía alcance ejecutable y no se implementa en este turno. Propuesta limitada .gitignore/validación actual en phase-02.md; permisos y exclusiones de fase intactos.

B03-02 aceptado/cerrado tras APPROVE_WITH_FOLLOWUPS sin P0–P2; correcciones P3 de confirmación/atributos requieren revisión focalizada. Ése es el único siguiente nodo, no B03-03. Compatibilidad .gitignore/.git* prioritaria antes de proyectos reales habituales, sin ampliarla ahora.

Antes de editar: leer `status.md`, verificar Git y baseline, confirmar alcance, archivos y comandos. Después: cambio mínimo, pruebas pertinentes, gates, diff y secretos, commit cohesionado, actualización de estado/cobertura/decisiones/riesgos y siguiente nodo. La plantilla concreta y desglose de Fase 00 están en `phases/phase-00.md`. Cada milestone importante produce `reviews/current-review-packet.md` y espera la revisión externa entregada por el usuario.

Cierre vigente B03-04: segunda auditoría APPROVE_WITH_FOLLOWUPS, P2 resuelto/intacto, a1f4c97 corrige P3-1/P3-2 con seis rojas/seis verdes y 432/432 + gates. Nodo aceptado/cerrado bajo condición del usuario; P3-3/R-055 y P3-4/R-056 aceptados pendientes. Sustituye el estado operativo pendiente anterior, sin atribuir revisión externa adicional del correctivo. Fase 02 abierta; no se define/inicia otro nodo en este cierre.

Estado vigente B03-05: nodo registrado d7121e8 y código 901290a, ContextEnvelope mínimo con mapa derivado e instrucciones CAS; 436/436 y gates verdes. Pendiente de revisión independiente. Fase 02 abierta, sin nuevo nodo ni proveedores/agentes; rechazo conservador no es redacción transformadora. B03-01–04 aceptados/cerrados y dependencias de fases conservadas.

B03-05 correctivo 0c662fc: 439/439 dos corridas completas, gates con exit nativo 0, pendiente de revisión focalizada. Nodo y Fase 02 abiertos. D-036 es propuesta no aceptada: se mantiene sin cambios el criterio original de redacción hasta aprobación expresa del propietario. No otro nodo ni proveedor.

Cierre vigente B03-05: segunda aceptación independiente APPROVE_WITH_FOLLOWUPS, defectos originales corregidos; P3 transversal local de96f51 y 442/442 con gates verdes. No se atribuye auditoría independiente adicional del correctivo. Fase 02 abierta, R-061 no reproducida/sin causa y demás seguimientos vigentes; D-036 no aceptada y criterio original de redacción intacto. Ningún otro nodo/proveedor/agente iniciado.

Estado vigente: D-036 ACCEPTED por autorización expresa del propietario (alternativa B); Fase 02 cerrada tras matriz de diez criterios y 442/442 de referencia repetidos con gates nuevos exit nativo 0. Exclusión/rechazo no constituye redacción transformadora ni autoriza envío/procesamiento de secretos; redacción diferida a frontera de proveedor/exportación. Riesgos aceptados para MVP no resueltos, R-061 no reproducida/sin causa. Sustituye estados históricos anteriores de fase abierta/D-036 pendiente. Siguiente Fase 03, no iniciada; propuesta B05-01 probe local seguro de Ollama sin inferencia ni contexto, respetando clasificación/política/evals antes de consumo de datos. No otros objetivos/contratos cambiados.
