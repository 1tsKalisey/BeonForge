# B06-01 — evidencia de la primera vertical API + Angular sintética

Fecha 2026-11-03. Rama `phase/02-project-inspection`; `main` sin cambios; sin push ni merge. Redactado y ejecutado por Claude Code a solicitud directa del propietario. No se ejecutó Codex real ni ningún agente, sin credenciales, inferencias ni tráfico a proveedores. D-043/D-047/D-048 vigentes; c.1 global y c.3 BLOCKED; F2 de c.2 abierto.

## Commits

| Commit | Contenido |
| --- | --- |
| 69e0136 | docs(c.2): cierre B04-01c.2 APPROVE_WITH_FOLLOWUPS |
| ad3652e | docs(b06): D-048 y plan B06-01 (phase-06.md) |
| 71adc20 | feat(b06): API loopback sobre M04.1 y c.2 + 8 tests de integración |
| de89ed0 | feat(b06): UI Angular mínima + e2e con navegador real |
| f974d91 | fix(b06): CSP `base-uri 'self'` (defecto detectado por el e2e) |

Comparar con `git diff e5b829b..f974d91`. Kernel, contratos y persistencia sin cambios; sin nuevos exports.

## Flujo demostrado (e2e sobre HEAD f974d91)

Navegador real (Edge instalado, headless, `playwright-core` sin descarga de navegadores) → Angular → API `/api/v1` en `127.0.0.1` → M04.1/c.2 → SQLite/CAS → consulta:

1. La UI sólo ofrece los dos ejecutores simulados del registro del servidor.
2. `synthetic-bugfix`: crear → confirmar el parche fijo mostrado → ejecutar → tests rojo (exit 1) y verde (exit 0), diff `a - b → a + b`, revisión pendiente.
3. Backend **terminado** (TerminateProcess) y relanzado en otro puerto: la UI recarga y muestra estado, tests y diff idénticos.
4. Aprobación explícita desde la UI → `Aprobada (confirmada)`, integración no realizada.
5. `codex-simulated`: propuesta saneada cuyo hash coincide con la postimagen conocida; **sin** tests, diff ni revisión.
6. Sin errores de consola ni peticiones fuera de loopback. Peticiones del navegador registradas: 2× `POST /tasks` 201, 2× `POST …/run` 202, 1× `POST …/review` 202.
7. Con el backend detenido, un **proceso separado** (`apps/web/e2e/verify-store.mjs`) reabre los stores del disco: el diff, los hashes de los tests rojo/verde, la revisión confirmada y el hash de la propuesta coinciden con lo mostrado por la UI.

La UI no contiene respuestas simuladas: `Api` hace `fetch` same-origin y los pasos 6–7 prueban que los datos mostrados vienen del backend y de la persistencia. Los únicos fetch falsos están en el test unitario del cliente (`view.test.ts`).

## Gates (logs locales en `artifacts/evidence/b06-01-gates/`, ignorado por Git)

Node 24.19.0 / pnpm 12.15.0.

| Gate | Resultado |
| --- | --- |
| `pnpm.cmd install --frozen-lockfile` | exit 0 |
| `pnpm.cmd peers check` | exit 0 |
| `pnpm.cmd check` (formato, lint, typecheck, build incl. `ng build`, tests) | exit 0, 13:06:43Z–13:24:31Z |
| Tests | **795/795**, 0 fallos/skips: web 5, contratos 62, persistencia 115, Ollama 201, workspace 187, runtime 218 (210 previos + 8 API), spike 7 |
| `git diff --check e5b829b..HEAD` | exit 0 |
| e2e `pnpm.cmd e2e` sobre f974d91 | exit 0, 10/10 pasos |
| Escaneo de secretos/rutas personales sobre el diff de la entrega | sin hallazgos |

El e2e no forma parte de `pnpm check` (requiere navegador instalado); se registra como gate separado.

## Hashes SHA-256

Evidencia e2e final `artifacts/evidence/b06-01-e2e-hXLtxH/`: `report.json` ff97316380c4644f0d3b92adbe90768b5b4ebc2a0de4f0d6c5e7fdaa1a3b77a6, `verify-store.json` 47cef2f3b62c31247160082cbe847dcf09c94b86938c88cef4bcf0555afb1f2e; índice completo en `sha256.json` de esa carpeta.

Gates: `check.stdout.log` b5be126dcd4364911a0c0a431318d191b20e502e129844b3d7d03688e7dd70ab, `check.exit` 9e4c74b6afbabdc9478d0f0c1adca1bfa2ca49961aaad576b5fe03c1fb1960d6, `e2e.stdout.log` a04ebfc40991c41542195e19e9531b26e9c78c49bb1eb81c8a5034134d2a9f8d; índice completo en `artifacts/evidence/b06-01-gates.sha256`.

Fallo CSP (ejecución roja anterior, copiada de `%TEMP%` con autorización puntual): `artifacts/evidence/legacy-temp/beonforge-e2e-evidence-IVgf2W/report.json` 2199b15ba6bd0e5317a53e8646e63ac7b9dea9a98022e06bbe8ab6b94c0db750. Las demás carpetas temporales de ejecuciones previas no se copiaron.

Fuentes: `examples/api/tasks.ts` e8a0186e…7c46, `server.ts` f9365743…b8e8f, `cli.mjs` 28ccf160…30b8, `test/api.test.ts` c14433bd…0cd8, `apps/web/src/app/api.ts` 2906ce9d…8c97, `view.ts` 21ac88b3…e0d1, `app.ts` 76d5f39a…790b, `app.html` f0b3a706…a409, `e2e/run.mjs` 2d8180bc…e2c8, `verify-store.mjs` bd0dd221…77b0, `pnpm-lock.yaml` 040e583b…432e.

## Incidencias durante la entrega, conservadas

- Primera ejecución e2e roja: la CSP `base-uri 'none'` bloqueaba `<base href="/">` de Angular. Se corrigió sólo esa causa (f974d91).
- `pnpm install` rechazó scripts de build de dependencias: se declararon **no permitidos** (`allowBuilds: false`), sin aprobarlos.
- `peers check` falló por `@emnapi` alpha del fallback WASI de oxc-parser: se eliminó ese binding opcional no usado mediante `overrides`.
- Lint: 6 errores en la web y 1 en el verificador, corregidos antes del gate final.
- Riesgo de carrera detectado en revisión propia: dos POST `/run` simultáneos podían validar la misma vista. Corregido antes del commit (el slot de mutación se reserva antes de validar) y cubierto por un test.

## Arranque

```text
pnpm.cmd install --frozen-lockfile
pnpm.cmd build
cd packages/runtime
node examples/api/cli.mjs --allow-synthetic-tasks --data C:\RUTA\DATOS-SINTETICOS
```

Abrir `http://127.0.0.1:4317`. `--data` debe existir, ser absoluta y canónica y estar fuera del checkout. Detener con Ctrl+C. Desarrollo de la UI: `cd apps/web` y `pnpm.cmd build` (el backend sirve `dist/web/browser`).

## Rollback

Revert de 71adc20, de89ed0 y f974d91 (y opcionalmente ad3652e); sin borrar directorios de datos ni evidencias.
