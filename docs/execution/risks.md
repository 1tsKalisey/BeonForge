# Registro de riesgos

Actualizado: 2026-10-25. Severidad estimada: alta, media o baja.

| ID | Severidad | Riesgo y evidencia | Mitigación / condición de cierre |
|---|---|---|---|
| R-001 | Alta, mitigado | Antes de F00-01, `git` resolvía a `C:/Users/ramen/Desktop` y su índice contenía archivos ajenos. | Git propio inicializado y raíz comprobada. Revalidar raíz antes de cada tarea; no alterar Git superior. |
| R-002 | Media | `knowledge/` quedará fuera de Git propio; una copia aislada no incluirá su fuente de verdad. | Referencia exacta en plan, preservar vault local, decidir distribución antes de compartir o automatizar en CI. |
| R-003 | Media, abierto | Workspace y gates locales funcionan; F-1 corrigió el pin de pnpm/setup en `dfcbb1d`, pero no hay CI remota observada. | Usuario decide si deuda explícita permite cerrar M00.3; validar el primer run remoto cuando exista repo conectado. CI sigue siendo prototipo. |
| R-004 | Media | El shim PowerShell de pnpm y npm falla por execution policy. | Usar `pnpm.cmd` y `npm.cmd`; documentar comandos Windows. |
| R-005 | Media | Especificación amplia; riesgo de carpetas o interfaces vacías contabilizadas como capacidad. El paquete de contratos de Fase 00 sólo exporta la versión de formato. | Roadmap vertical, matriz de cobertura con estado y evidencia, demo por fase; no contar kernel hasta Fase 01. |
| R-006 | Alta | Futuros modelos, plugins y herramientas pueden filtrar código/secretos o ejecutar instrucciones de contenido no confiable. | Fases posteriores: política, clasificación, sandbox, redacción, probes y evals antes de activación. |
| R-007 | Media | Migraciones de estado pueden perder recuperación o repetir efectos. | Contract tests, versiones, backup/restore, idempotencia y demo de reanudación en Fase 01. |
| R-008 | Baja | El sandbox creó `.git` con propietario distinto al usuario Windows; Git considera el repositorio inseguro sin excepción local al comando. | Usar `git -c safe.directory=C:/Users/ramen/Desktop/Programacion/BeonForge`; no modificar la configuración global. Escrituras a `.git` pueden necesitar escalación. |
| R-009 | Baja | El store global de pnpm no es escribible dentro del sandbox, aunque la instalación frozen se reproduce al ejecutar con permiso. | Mantener lockfile fijado y documentar escalación del entorno; no cambiar configuración del usuario. |
| R-010 | Baja, mitigado | TypeScript 7.0.2 compilaba, pero `typescript-eslint` 8.72.0 lo declaraba fuera del peer compatible. | F00-03 fijó TypeScript 6.0.3; `pnpm.cmd peers check` pasó. Revalidar peers en actualizaciones. |
| R-011 | Baja, seguimiento Fase 01 | Typecheck del smoke test resuelve el paquete a `src`, mientras runtime importa `dist`; no verifica la paridad de tipos publicados. | Al crecer los contratos, typecheck contra `dist/index.d.ts` o retirar el alias `paths`. |
| R-012 | Baja, seguimiento Fase 01 | ESLint no aplica reglas con información de tipos y sólo cubre `.ts`/`.mjs`. | Antes del kernel asíncrono, evaluar `recommendedTypeChecked`; ampliar globs si entran `.js`/`.cjs`. |

La revisión formal de M00.3 se trató; falta decisión humana sobre CI remota no observada. Ninguna excepción de gate está aprobada de forma implícita.
