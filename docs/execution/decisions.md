# Registro de decisiones

Actualizado: 2026-10-28. Las decisiones de la especificación se citan, no se atribuyen a una implementación inexistente.

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
| D-014 | Decidida por el usuario | M00.3 sólo puede cerrarse tras observar un run remoto verde. La deuda explícita no basta. F-1 ya fue corregido. | No cerrar ni iniciar Fase 01 antes de guardar evidencia del run; no publicar sin autorización específica. |
| D-015 | Ejecutada | Repositorio remoto privado `1tsKalisey/BeonForge`; `origin` configurado. Run de fase `40202416013` verde satisface D-014. Con autorización explícita, `main` avanzó por fast-forward hasta el cierre, se publicó junto a `phase/00-foundation` y quedó como rama predeterminada; run de `main` `40202841059` verde. | Preservar visibilidad privada salvo decisión del usuario; futuras ramas parten de `main`. |
| D-016 | Fijada | Archivos de texto normalizados a LF mediante `.gitattributes`; formatos binarios comunes se marcan `binary`. El checkout de `main` en Windows había materializado CRLF y hacía fallar Prettier pese a que CI Linux pasaba. | Mantener el gate local en Windows y ampliar patrones binarios cuando se incorporen nuevos formatos. |

## Reglas

- D-017 — Aprobada por el usuario: adoptar selectivamente la implementación B01 del PR #1 como base, auditar compatibilidad antes de incorporar commits y completar sólo lo necesario. El kernel antiguo de otro ordenador no está disponible ni es prerrequisito. B00-01 es exclusivamente documental.
- D-018 — Aprobada por el usuario: spike mínimo de SQLite antes de elegir driver, con preferencia por `node:sqlite`; verificar WAL, transacciones, reapertura e idempotencia. No seleccionar dependencia definitiva en B00/B01.
- D-019 — Aprobada por el usuario: BeonForge es un orquestador ligero; el kernel se limita a orquestación, persistencia, estados, recuperación, permisos y coordinación. OpenCode/Codex son motores externos; Claude Code es revisión independiente. Se conserva la pausa de revisión al cerrar contratos antes de persistencia/runtime.
- D-020 — Revisada en M01.1 (APPROVE_WITH_FOLLOWUPS, F-4 resuelto): contratos de datos v1 con parsers explícitos sin nueva dependencia; rechazo de campos extra/versiones no soportadas, inputs/evidencia por SHA-256 y resultados por intento separados del lifecycle de tarea. Efectos declarados no conceden permisos. Las fronteras y límites están en `packages/contracts/README.md`; futura incompatibilidad de formato exigirá versión/migración explícita.

Una incompatibilidad deliberada, retirada funcional, cambio mayor de arquitectura o uso de secretos requiere decisión humana. Toda ADR futura tendrá contexto, opciones, decisión, consecuencias, fecha y rollback.
