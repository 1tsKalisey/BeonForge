# Registro de riesgos

Actualizado: 2026-10-28. Severidad estimada: alta, media o baja.

| ID | Severidad | Riesgo y evidencia | Mitigación / condición de cierre |
|---|---|---|---|
| R-001 | Alta, mitigado | Antes de F00-01, `git` resolvía a `C:/Users/ramen/Desktop` y su índice contenía archivos ajenos. | Git propio inicializado y raíz comprobada. Revalidar raíz antes de cada tarea; no alterar Git superior. |
| R-002 | Media | El vault `knowledge/` no está disponible en este checkout; PREP-001 sólo acredita su lectura histórica. | Usar instrucciones, ejecución y objetivo de producto actuales; si una tarea exige detalle ausente, registrar el bloqueo concreto. No recrear ni modificar el vault. |
| R-003 | Cerrado para Fase 00 | F-1 corrigió el pin de pnpm/setup en `dfcbb1d`; faltaba CI remota observada. | Run `40202416013` terminó `success` sobre `84d7328`; evidencia registrada. |
| R-004 | Media | El shim PowerShell de pnpm y npm falla por execution policy. | Usar `pnpm.cmd` y `npm.cmd`; documentar comandos Windows. |
| R-005 | Media | Especificación amplia; riesgo de carpetas o interfaces vacías contabilizadas como capacidad. El paquete de contratos de Fase 00 sólo exporta la versión de formato. | Roadmap vertical, matriz de cobertura con estado y evidencia, demo por fase; no contar kernel hasta Fase 01. |
| R-006 | Alta | Futuros modelos, plugins y herramientas pueden filtrar código/secretos o ejecutar instrucciones de contenido no confiable. | Fases posteriores: política, clasificación, sandbox, redacción, probes y evals antes de activación. |
| R-007 | Media | Migraciones de estado pueden perder recuperación o repetir efectos. | Contract tests, versiones, backup/restore, idempotencia y demo de reanudación en Fase 01. |
| R-008 | Baja, histórico | El sandbox anterior requería una excepción de propiedad Git. El checkout actual resuelve a `C:/Users/RaulMéndez/Desktop/personal/BeonForge` sin ese error. | Verificar siempre la raíz real; sólo si es necesario usar `safe.directory` por comando con esa raíz, nunca configuración global. |
| R-009 | Baja, histórico | El store de pnpm del ordenador anterior requería permisos adicionales; no se reproduce en B00-01. | Mantener lockfile; el entorno actual usa Corepack para pnpm 12.15.0 sin instalar shims globales. |
| R-010 | Baja, mitigado | TypeScript 7.0.2 compilaba, pero `typescript-eslint` 8.72.0 lo declaraba fuera del peer compatible. | F00-03 fijó TypeScript 6.0.3; `pnpm.cmd peers check` pasó. Revalidar peers en actualizaciones. |
| R-011 | Baja, seguimiento Fase 01 | Typecheck del smoke test resuelve el paquete a `src`, mientras runtime importa `dist`; no verifica la paridad de tipos publicados. | Al crecer los contratos, typecheck contra `dist/index.d.ts` o retirar el alias `paths`. |
| R-012 | Baja, seguimiento Fase 01 | ESLint no aplica reglas con información de tipos y sólo cubre `.ts`/`.mjs`. | Antes del kernel asíncrono, evaluar `recommendedTypeChecked`; ampliar globs si entran `.js`/`.cjs`. |
| R-013 | Cerrado | Inicialmente no había remoto y no podía ejecutarse GitHub Actions. | `origin` configurado a `1tsKalisey/BeonForge`, repositorio privado; rama de fase publicada y run verde observado. |

M00.3 y Fase 00 están cerrados con revisión formal y CI remota verde. R-011 y R-012 continúan como seguimientos obligatorios de Fase 01. Ninguna excepción de gate está aprobada de forma implícita.

- R-014 — Media: los tests de transiciones del PR #1 calculan parte de sus expectativas desde la misma tabla que prueban. B01-01 debe añadir expectativas independientes y auditar la distinción entre tarea, intento y efecto incierto antes de persistir esos estados.
- R-015 — Baja: Node local es `24.13.0`, dentro del rango del manifest, pero distinto de `24.19.0` usado por la CI histórica. El spike debe registrar la versión evaluada; gates locales no acreditan un nuevo run remoto.
