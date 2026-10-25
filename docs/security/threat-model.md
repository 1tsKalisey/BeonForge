# Threat model inicial — Fase 00

Fecha: 2026-10-25. Alcance: repositorio y toolchain actuales, más fronteras previstas del kernel. Este documento identifica amenazas; no afirma que controles futuros estén implementados.

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
| Corrupción de eventos, blobs o migración | Alto | No hay estado de runs todavía | Hashes, transacciones, backups probados, migraciones versionadas y replay |
| Plugin o MCP con permisos excesivos | Alto | Ninguno activado | Instalación deshabilitada, allowlist, aislamiento, permisos por bloque y contract tests |
| Resumen engañoso induce aprobación de riesgo | Alto | Usuario revisa cambios concretos en esta fase | Approval packet con diff, efectos, evidencia, impacto y rollback; reviewer separado |

## Invariantes de salida de Fase 00

- Nada se publica, despliega, factura o envía a servicios externos desde el producto.
- `knowledge/` y `.claude/` permanecen intactos y fuera del Git propio.
- Los gates locales y el diff son evidencia; CI remota sólo contará tras un run observado.
- Fallar cerrado ante un permiso o estado de efecto desconocido será requisito del kernel.

## Seguimiento

Actualizar este modelo al abrir una frontera nueva. Vincular controles a tests, política, telemetría y riesgos en `docs/execution/risks.md`. La clasificación de datos `public`, `internal`, `confidential`, `secret`, `regulated` debe existir antes de enrutar contexto a modelos externos.
