# CI inicial

El workflow `.github/workflows/ci.yml` corre en push y pull request con permisos `contents: read`. Usa Ubuntu 24.04, Node 24.19.0 y pnpm 12.15.0 del campo `packageManager`; las acciones están fijadas a los SHAs consultados de sus tags oficiales `actions/checkout@v7` y `pnpm/setup@v3` el 2026-10-25. `pnpm/setup` con `require-lockfile: true` exige el lockfile y ejecuta instalación congelada. Después se verifican peers y `pnpm check` (formato, lint, typecheck, build y tests).

Reproducción local desde la raíz: `pnpm.cmd install --frozen-lockfile`, `pnpm.cmd peers check`, `pnpm.cmd check`. En Linux/macOS, usar `pnpm` en lugar de `pnpm.cmd`.

El workflow y su YAML se han comprobado localmente, pero todavía no hay evidencia de una ejecución remota. No considerar CI verde en GitHub hasta observar un run real. No contiene pasos de despliegue, publicación ni secretos.
