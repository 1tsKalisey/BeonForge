# Fase 00 — Foundation

Actualizado: 2026-10-25. Estado: revisión formal `APPROVE_WITH_FOLLOWUPS` tratada; cierre pendiente de decisión del usuario sobre CI remota. Dependencia PREP-001 satisfecha. F00-01 aceptada en `487d5e8`; F00-02 en `3fc9d52`; F00-03 en `b4d56e4`; F00-04 en `c0dc05f`; F00-05 en `05b6a51`; F-1 corregido en `dfcbb1d`; rama activa `phase/00-foundation`.

## Resultado observable

Un checkout de BeonForge ejecuta instalación con lockfile, format check, lint, typecheck, unit tests y build mediante comandos documentados. Un workflow CI ejecuta los mismos gates. Existe un límite modular real, ADRs, threat model y AGENTS.md. No se declara kernel implementado.

## Milestones y gates

| Milestone | Resultado | Gate | Rollback |
|---|---|---|---|
| M00.1 Repositorio | Git propio y baseline acotado; memoria operativa accesible | Raíz Git correcta, diff/secret/scope checks, primer commit en `main` | Conservar archivos y commits; revertir sólo mediante commit nuevo si hiciera falta. |
| M00.2 Toolchain | Workspace, TypeScript estricto, gates y build reproducibles | Instalación frozen y todos los comandos verdes | Revertir commits de configuración de forma no destructiva. |
| M00.3 Gobernanza | CI, ADRs, threat model, AGENTS.md y paquete de revisión | CI equivalente a local, docs completas y diff revisado | Revertir commit afectado; no retirar gates sin ADR. |

M00.3 es el primer milestone importante que requiere `docs/execution/reviews/current-review-packet.md` y pausa para revisión externa.

## Tareas ejecutables

### F00-01 — Repositorio y baseline

- Objetivo único: aislar el versionado de BeonForge del Git superior y fijar un baseline documental.
- Alcance / archivos: `.git/`, `.gitignore`, `docs/execution/{master-plan,status,decisions,risks,coverage}.md`, `docs/execution/phases/phase-00.md`.
- Exclusiones: `knowledge/`, `.claude/`, código de producto, instalación, reconfiguración del Git superior.
- Entradas: inspección PREP-001 y los 23 documentos del plan.
- Entregables: rama `main`, commit inicial, `phase/00-foundation` como rama de trabajo posterior.
- Aceptación: `git rev-parse --show-toplevel` apunta exactamente al proyecto; el commit contiene sólo archivos previstos; archivos del usuario intactos.
- Validación: `git status --short --branch`; `git diff --check`; `git diff --cached --stat`; `git show --stat --oneline HEAD`.
- Presupuesto aproximado: 1 commit de baseline, hasta 7 archivos versionados y 30 minutos.
- Parada: si la raíz Git no se aísla o aparece un archivo ajeno preparado, no hacer commit. Rollback: no borrar; conservar estado y documentar.

### F00-02 — Workspace y compilador estricto

- Objetivo único: crear el workspace mínimo y compilar un paquete de contratos sin lógica de kernel.
- Alcance / archivos: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `packages/contracts/{package.json,tsconfig.json,src/index.ts}` y lockfile cuando corresponda.
- Exclusiones: runtime, persistencia, CLI, providers, dashboard.
- Entradas: F00-01 aceptada; versiones de herramientas fijadas.
- Entregables: workspace y comando `typecheck`/`build` funcional.
- Aceptación: TypeScript strict real, sin `any`, build limpio en checkout.
- Validación: `pnpm.cmd install --frozen-lockfile`, `pnpm.cmd typecheck`, `pnpm.cmd build`, diff.
- Presupuesto: un paquete, hasta 8 archivos y 45 minutos.
- Parada: si instalar exige cambios de alcance o la versión de pnpm/Node no es compatible; registrar evidencia y decidir ajuste. Rollback: revertir commit.

### F00-03 — Gates locales

- Objetivo único: incorporar formato, ESLint y Vitest con una prueba útil de contrato de configuración/workspace.
- Alcance / archivos: manifests, lockfile y configuración de ESLint/Prettier/Vitest; test de smoke de importación del paquete.
- Exclusiones: tests ficticios de runtime, CI, lógica de dominio.
- Entradas: F00-02 aceptada.
- Entregables: comandos `format:check`, `lint`, `test` y `check` documentados.
- Aceptación: gates detectan un fallo relevante y pasan en baseline.
- Validación: format, lint, typecheck, test, build, diff y secret scan local.
- Presupuesto: hasta 8 archivos y 60 minutos.
- Parada: si un gate obligatorio no pasa, no aceptar. Rollback: revertir commit.

### F00-04 — CI inicial

- Objetivo único: ejecutar en CI los gates locales sobre la versión fijada de Node/pnpm.
- Alcance / archivos: `.github/workflows/ci.yml` y documentación breve de ejecución.
- Exclusiones: despliegue, publicación, credenciales, release remoto.
- Entradas: F00-03 aceptada.
- Entregables: workflow CI y validación de sintaxis/consistencia local.
- Aceptación: mismos comandos y lockfile congelado; sin secretos.
- Validación: gates locales, revisión de workflow y diff.
- Presupuesto: hasta 2 archivos y 30 minutos.
- Parada: no afirmar CI remoto verde si no se ha ejecutado. Rollback: revertir workflow.

### F00-05 — ADR, threat model e instrucciones

- Objetivo único: fijar reglas operativas y amenazas iniciales para comenzar kernel.
- Alcance / archivos: `AGENTS.md`, plantilla y primeras ADRs en `docs/adr/`, `docs/security/threat-model.md`, memoria operativa.
- Exclusiones: implementación de policy engine o sandbox.
- Entradas: F00-01 a F00-04 aceptadas y plan principal.
- Entregables: decisiones, amenazas con mitigaciones y review packet de M00.3.
- Aceptación: instrucciones compatibles con usuario; riesgos trazados; gates locales verdes; paquete reproducible para Claude Code.
- Validación: format/lint/typecheck/test/build, revisión del diff, scope y secretos.
- Presupuesto: hasta 7 archivos y 60 minutos.
- Parada: detener tras preparar paquete; esperar revisión entregada por el usuario. Rollback: revertir commit puntual sin operaciones Git destructivas.

## Decisiones humanas

No hay decisión humana previa para F00-01. Solicitar dirección si se pretende compartir el vault, usar secretos, publicar, desplegar o cambiar arquitectura/alcance de forma sustancial. La revisión externa del milestone importante la aporta el usuario.
