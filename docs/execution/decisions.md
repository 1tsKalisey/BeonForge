# Registro de decisiones

Actualizado: 2026-10-25. Las decisiones de la especificación se citan, no se atribuyen a una implementación inexistente.

| ID | Estado | Decisión y fundamento | Revisión |
|---|---|---|---|
| D-001 | Acordada | Control plane Node.js y TypeScript estricto como monolito modular con puertos y adaptadores; dominio independiente de SDKs. | Reabrir sólo con necesidad medida. |
| D-002 | Acordada | SQLite WAL para eventos/proyecciones locales y filesystem content-addressed para artefactos. | Evaluar Postgres/Temporal sólo por escala real. |
| D-003 | Acordada | Kernel durable y demo sin IA antes de proveedores, agentes o dashboard. | Gate de Fase 01. |
| D-004 | Acordada | pnpm workspaces, Vitest, ESLint y formato consistente; evitar orquestadores de monorepo iniciales. | Fase 00. |
| D-005 | Acordada | Codex único escritor en fases iniciales; revisión Claude Code externa sólo cuando la entregue el usuario. | Fase 07 puede proponer evolución. |
| D-006 | Acordada | CLI y API de control antes del dashboard Angular; OpenAI-compatible queda en adaptadores. | Fases 01, 09. |
| D-007 | Acordada | Reglas auditables antes de router aprendido; Ollama primer adapter local candidato; OmniRoute restringido y diferido. | Fases 03 y 06. |
| D-008 | Decisión operativa reversible | Crear Git anidado propio porque el Git visible pertenece al Desktop y contiene cambios ajenos. No modificar su índice ni su historial. | Verificar raíz tras `git init`. |
| D-009 | Decisión operativa reversible | Ignorar `knowledge/` y `.claude/` en el Git nuevo: son archivos existentes del usuario y el vault es de solo lectura. Documentar la dependencia de especificación externa. | Reconsiderar mediante decisión explícita si se desea distribución autocontenida. |
| D-010 | Diferida | Versiones de dependencias aún no instaladas, framework HTTP, sandbox por plataforma, motor de evals, licencia/distribución y futura base vectorial/grafo. | Resolver en la fase que lo necesite con evidencia. |
| D-011 | Sustituida parcialmente | Node 24 (`>=24 <25`) y pnpm `12.15.0` siguen fijados; TypeScript `7.0.2` se usó en F00-02 pero `typescript-eslint` 8.72.0 declara peer `>=4.8.4 <6.1.0`. | Ver D-012. |
| D-012 | Fijada para Fase 00 | TypeScript `6.0.3`, ESLint `10.13.0`, `@eslint/js` `10.0.1`, `typescript-eslint` `8.72.0`, Prettier `3.9.10` y Vitest `5.0.5`, todos exactos y sin problemas de peer. | Cambios futuros requieren lockfile y gates completos. |
| D-013 | Fijada para Fase 00 | CI inicial en GitHub Actions con permisos `contents: read`, Ubuntu 24.04, Node 24.19.0, pnpm fijado por manifest, lockfile obligatorio y acciones fijadas por SHA. Sin publicación ni secretos. | Validar primer run remoto; actualizar SHAs mediante tarea de dependencias aislada. |
| D-014 | Pendiente del usuario | Decidir si M00.3 puede cerrarse con la deuda explícita de CI remota no observada o si exige run verde antes del cierre. F-1 ya fue corregido. | No cerrar ni iniciar Fase 01 hasta recibir la decisión. |

## Reglas

Una incompatibilidad deliberada, retirada funcional, cambio mayor de arquitectura o uso de secretos requiere decisión humana. Toda ADR futura tendrá contexto, opciones, decisión, consecuencias, fecha y rollback.
