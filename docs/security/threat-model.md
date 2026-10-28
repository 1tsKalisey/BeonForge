# Threat model inicial — Fase 00

Actualizado: 2026-10-28. Alcance: repositorio/toolchain y fronteras de persistencia, CAS y recuperación B02b-01/02; los demás controles futuros siguen pendientes.

## Activos y fronteras

Activos: código y propiedad intelectual, especificación `knowledge/`, credenciales futuras, Git y worktrees, eventos, artefactos, backups y decisiones humanas. Fronteras: usuario ↔ control plane; repositorio/vault/tool output ↔ instrucciones; bloque ↔ filesystem/comandos/red; aplicación ↔ proveedores/plugins; proceso ↔ SQLite/blob store; CI ↔ dependencias y acciones externas.

## Amenazas y controles

| Amenaza | Impacto | Control presente | Control exigido antes del efecto |
|---|---|---|---|
| Git superior o ruta ambigua causa commit fuera de BeonForge | Alto | Git propio, comprobación de raíz, staged paths explícitos | WorkspaceProvider acotado y diff-scope gate en Fase 02 |
| Instrucción maliciosa en `knowledge/`, README, web o tool output | Alto | Vault tratado como datos de especificación; revisión humana actual | Separar instrucciones autorizadas y datos, procedencia, validación y pruebas adversariales |
| Path traversal, symlink o escritura fuera del worktree | Alto | Sandbox de desarrollo y único escritor | Raíces canónicas, política por efecto, tests de frontera y aislamiento en Fases 01–02 |
| Comando destructivo o efecto repetido tras crash | Alto | Aprobación humana y ausencia de runtime de efectos | Idempotency keys, checkpoints, estado incierto explícito, no reintento de efectos irreversibles |
| Exfiltración de secretos por logs, prompts, proveedor o plugin | Alto | No se usan secretos; escaneo textual de cambios | SecretStore por referencia, redacción previa, clasificación de datos y egress mínimo antes de proveedores |
| Dependencia o acción CI comprometida | Medio/alto | Lockfile, versiones exactas, peer check, acciones CI por SHA y permisos `contents: read` | Revisión de advisories, licencias, SBOM y canary por actualización |
| Corrupción de eventos, blobs o migración | Alto | SQLite v2 WAL/FULL en worker, evento/proyección atómicos, CAS verificado, checkpoints contrastados con replay y backup online/restore aislado validados; tests de rollback/kill/reapertura | Revisión M01.2, protección del archivo local y demo de recuperación de ejecución B02b-03; sin afirmar exactly-once de efectos o autenticación del dueño |
| Plugin o MCP con permisos excesivos | Alto | Ninguno activado | Instalación deshabilitada, allowlist, aislamiento, permisos por bloque y contract tests |
| Resumen engañoso induce aprobación de riesgo | Alto | Usuario revisa cambios concretos en esta fase | Approval packet con diff, efectos, evidencia, impacto y rollback; reviewer separado |

## Invariantes de salida de Fase 00

- Nada se publica, despliega, factura o envía a servicios externos desde el producto.
- `knowledge/` y `.claude/` permanecen intactos y fuera del Git propio.
- Los gates locales y el diff son evidencia; CI remota sólo contará tras un run observado.
- Fallar cerrado ante un permiso o estado de efecto desconocido será requisito del kernel.

## Seguimiento

Segunda revisión M01.2 APPROVE_WITH_FOLLOWUPS aceptada y followups verificados: destinos restore fuera del origen/CAS/directorios activos protegidos antes de crear; SQLite y artifactRoot inspeccionan ancestros de recuperación y no permiten putArtifact externo sobre backups. Rol aditivo de backup y formato versionado distinguen manifest ajeno y copias legacy selladas sin aceptar conjuntos manipulados reconocibles. F-5 intacto, 184 tests verdes; cierre registrado. Siguen raíces/ancestros privados, ámbito intraproceso, memoria y ausencia de autenticación del propietario/power loss documentados en R-023/025/026/027.

Revisión M01.2 REQUEST_CHANGES: F-5 reduce trabajo redundante sin cachés entre operaciones ni retries inciertos; timeout de cola no despacha comandos. F-6 impide apertura normal de backups y requiere ready válido/DB/CAS existentes para restores identificados; los marcadores no son autenticación. F-7 comprueba destinos reales fuera de raíces DB/CAS antes de crear nada, incluyendo junctions y alias Windows. Regresiones reales/volumen y 151 tests verdes; correcciones pendientes de aprobación independiente, sin cierre del milestone. Siguen los límites de raíces privadas, memoria, retención y power loss R-023/025/026/027.

Actualizar este modelo al abrir una frontera nueva. Vincular controles a tests, política, telemetría y riesgos en `docs/execution/risks.md`. La clasificación de datos `public`, `internal`, `confidential`, `secret`, `regulated` debe existir antes de enrutar contexto a modelos externos.

B02b-01 no ejecuta handlers ni efectos externos, no concede permisos y no implementa redacción/cifrado. El path DB es configuración autorizada, no una ruta procedente de herramientas; sólo rutas absolutas, padre existente y sin symlink de archivo. El registro de writer es local al proceso, no liderazgo multiproceso ni sandbox. Un inicio sin finish sigue siendo pending y requiere reconciliación antes de reejecutar; pérdida de confirmación de append devuelve outcome_unknown. Reopen/replay no reejecuta trabajo. Los diagnósticos contienen códigos fijos, pero los productores siguen obligados a redactar contenido antes de persistirlo. Triggers no protegen frente a dueño privilegiado que modifique archivos/esquema; no se afirma autenticidad criptográfica del log.

B02b-02 publica blobs completos por link exclusivo después de fsync/validación, antes de confirmar referencias SQL. Huérfanos/temporales no se convierten en hechos confirmados ni se limpian automáticamente. Los checkpoints de workflow preservan pending/uncertain y son distintos del checkpoint interno WAL. El backup usa la API soportada SQLite, no una copia de .db activo; restore verifica SQLite, CAS y referencias en directorios nuevos antes de ready, sin opción de overwrite/activación. Copias incompletas fallan cerrado. Raíces privadas, lstat de componentes, descriptor no-follow/identidad y rechazo de junctions protegen frente a alias maliciosos bajo esas condiciones; no aíslan a un propietario privilegiado concurrente. Windows requiere ACL privada y no aporta fsync portable de directorios: los tests de proceso no prueban power loss. Hashes/manifests no son firmas ni mecanismo de autorización. R-025/R-026/R-027 documentan límites restantes.
