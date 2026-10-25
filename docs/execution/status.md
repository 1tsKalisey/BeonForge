# Estado persistente

Actualizado: 2026-10-25. Leer este archivo antes de cualquier tarea.

## Posición

- Fase actual: 00 — Foundation, cerrada.
- Milestone actual: M00.3 — aceptado y cerrado tras revisión independiente y CI remota verde.
- Última tarea aceptada: cierre M00.3 con run remoto `40202416013` verde sobre `84d732845e20576752809c28ec6e3e3b85f6c628`.
- Tarea activa: ninguna; siguiente nodo preparado: planificación ejecutable de Fase 01 — Kernel durable sin IA.
- Siguientes tareas: crear `docs/execution/phases/phase-01.md`; descomponer contratos y errores tipados antes de implementar persistencia o runtime; mantener F-2/F-3 como gates del kernel.
- Bloqueos: ninguno para planificar Fase 01. No iniciar implementación hasta definir sus milestones, tareas, dependencias, aceptación, gates y rollback.
- Decisiones pendientes: forma de distribuir o referenciar el vault sin incorporarlo a Git; framework HTTP en fase posterior; estrategia de schema validation del kernel.
- Último commit válido remoto antes del cierre documental: `84d7328` (`docs: require remote CI for foundation closure`). El commit de cierre se identifica con `git log -1` tras confirmar este estado.
- Revisión Claude: formal `APPROVE_WITH_FOLLOWUPS` completada; F-1 confirmado y corregido, F-2/F-3 registrados para Fase 01. M00.3 cerrado. Claude Code no se invoca desde aquí.

## Gates actuales

- PREP-001: 23/23 documentos del plan leídos; inventario del repo y herramientas completado; no se modificó `knowledge/`.
- F00-01: aceptado. `git rev-parse --show-toplevel` apuntó a BeonForge; `git diff --cached --check` pasó; commit limitado a siete archivos; `knowledge/` y `.claude/` ignorados, no modificados.
- F00-02: aceptado. `pnpm.cmd install --frozen-lockfile`, `pnpm.cmd typecheck`, `pnpm.cmd build` y smoke de importación Node pasaron. `git diff --cached --check` pasó; ocho archivos dentro de alcance; escaneo textual de secretos sin hallazgos.
- F00-03: aceptado. `pnpm.cmd install --frozen-lockfile`, `pnpm.cmd peers check` y `pnpm.cmd check` pasaron; un `any` deliberado por stdin produjo error de ESLint; 1/1 test pasó. TypeScript pasó de 7.0.2 a 6.0.3 porque `typescript-eslint` declara peer `<6.1.0`. Diff y escaneo textual de secretos sin hallazgos.
- F00-04: aceptado localmente. YAML parseado con PyYAML, estructura comprobada, `pnpm.cmd peers check` y `pnpm.cmd check` verdes, diff/secret scan limpios. Acciones fijadas por SHA. Ejecución remota no observada; no se afirma CI verde en GitHub.
- F00-05: aceptado. Instalación frozen, peers, `pnpm.cmd check` (formato, lint, typecheck, build, 1/1 test), audit sin vulnerabilidades conocidas, YAML parseado, diff y escaneo textual de secretos pasaron. Paquete de revisión preparado.
- Tras F-1: instalación frozen, peers, `pnpm.cmd check` (1/1 test), audit, YAML/pin, diff y escaneo de secretos pasaron. El SHA de `pnpm/setup` es ahora commit, no tag object.
- CI remota: run `40202416013`, workflow `CI`, evento `push`, rama `phase/00-foundation`, SHA `84d732845e20576752809c28ec6e3e3b85f6c628`, estado `completed`, conclusión `success`. Pasaron setup, checkout, pnpm/Node, peers y gates. URL: `https://github.com/1tsKalisey/BeonForge/actions/runs/40202416013`.
- Repositorio remoto: `origin` = `https://github.com/1tsKalisey/BeonForge.git`, privado; rama remota/default actual `phase/00-foundation`. La rama local `main` (`487d5e8`) no está publicada.

## Comandos de validación

Desde `C:\Users\ramen\Desktop\Programacion\BeonForge` en PowerShell: `git rev-parse --show-toplevel`, `git -c safe.directory=C:/Users/ramen/Desktop/Programacion/BeonForge status --short --branch`, el mismo prefijo para `diff --check` y `log -1 --oneline`. Al existir workspace: `pnpm.cmd install --frozen-lockfile`, `pnpm.cmd format:check`, `pnpm.cmd lint`, `pnpm.cmd typecheck`, `pnpm.cmd test`, `pnpm.cmd build`. El shim `pnpm.ps1` está bloqueado por la política de PowerShell; usar `pnpm.cmd`.

## Instrucciones exactas para continuar

1. Abrir este archivo, `master-plan.md`, `coverage.md`, `risks.md` y el paquete cerrado de M00.3. Fase 00 está cerrada.
2. Ejecutar `git rev-parse --show-toplevel` y comprobar que devuelve exactamente `C:/Users/ramen/Desktop/Programacion/BeonForge`. Usar el prefijo `git -c safe.directory=C:/Users/ramen/Desktop/Programacion/BeonForge` en cada comando Git restante.
3. Crear el plan detallado de Fase 01 antes de escribir kernel. El primer milestone debe fijar contratos versionados, errores tipados y transición de estados con tests; después persistencia, runtime/DAG y demo de recuperación.
4. Incluir F-2: typecheck contra tipos publicados al crecer los contratos. Incluir F-3: lint con información de tipos antes del kernel asíncrono. Ejecutar baseline y mantener una tarea/commit por unidad.
