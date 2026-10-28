# Proyectos Git locales — B03-01

Registro e inspección de un checkout existente; no crea worktrees ni selecciona contexto. API asíncrona `registerProject(root, policy, artifactStore)` devuelve `ArtifactReference` v1 existente (sha256 + byteLength). `inspectProject(reference, policy, artifactStore)` recupera y contrasta el descriptor con rutas y pins físicos actuales antes de inspeccionar. Tests consumen exports y CLI de `dist` tras build.

## CLI

Con Node 24.19.0/SQLite 3.53.3 aprobados, Git instalado y build actual:

```powershell
pnpm.cmd build
pnpm.cmd --filter @beonforge/workspace cli project register --root C:/proyectos/app --storage C:/BeonForge-private
pnpm.cmd --filter @beonforge/workspace cli project inspect --allow-root C:/proyectos/app --storage C:/BeonForge-private --ref <sha256> --bytes <byteLength>
```

`--storage` es un directorio privado **existente**, absoluto y separado de proyectos y metadatos autorizados. Ambas operaciones usan `projects.sqlite` y su ArtifactStore `projects.sqlite.artifacts` dentro de ese directorio. No existe catálogo: conservar la referencia completa y el mismo almacenamiento permite inspeccionar desde otro proceso/reinicio. Inspect no inicializa una DB ausente. POSIX exige propietario actual y modo sin permisos de grupo/otros; en Windows, el operador debe asegurar ACL privadas como en la persistencia existente. La API recibe un ArtifactStore confiable ubicado fuera de los proyectos; el CLI aplica la separación.

Para un worktree añadir en ambas operaciones `--git-root <gitdir-exacto>` y `--common-root <common-dir-exacto>`, obtenidos por el operador. Son autorizaciones separadas para metadatos; ninguna concede acceso a otros checkouts. `--allow-root` de inspect puede repetirse. Registro e inspección revalidan permisos; el descriptor no los otorga.

## Identidad y límites

- Descriptor JSON v1: raíz canónica, gitdir, common-dir, pins dev/ino/tipo y dos IDs SHA-256. pathId identifica la ruta canónica; repositoryId combina ruta y objeto físico del directorio común. Worktrees comparten repositoryId y tienen pathId distinto. Sustituir la raíz, `.git`, config o enlaces físicos de worktree requiere nuevo registro. No es identidad global de Git entre clones o tras mover el repositorio.
- HEAD/rama/índice pueden cambiar normalmente. Se informa HEAD nullable, detached/unborn, número de cambios tracked y presencia de gitlinks. No se persisten snapshots de inspección, contenidos, URLs remotas, configuración o nombres de archivos. El descriptor contiene rutas privadas: proteger el CAS y las referencias.
- Rutas locales absolutas; rechazo de traversal, symlinks/junctions, UNC/device paths y ADS en Windows. Permisos por parentesco de rutas canónicas, sin prefijos textuales. Identidad física no disponible (ino=0) falla cerrado. Se contrastan identidades antes/después de Git, bajo raíces y ancestros privados no modificables por actores hostiles. Esto no es sandbox contra un propietario privilegiado concurrente ni snapshot atómico de HEAD/índice.
- Allowlist Git fija, argv separados, sin shell, pager ni locks opcionales. Config global/system y variables Git heredadas aisladas; fsmonitor, atributos/excludes externos y lazy fetch desactivados. No se cambia safe.directory. Includes, filtros, continuaciones de configuración, alternates y git-dir separado que no sea worktree se rechazan; no se ejecutan proveedores, hooks ni comandos de configuración del repositorio.
- Sólo se leen pequeños archivos de configuración/punteros (256 KiB) y metadatos de identidad; se revisan entradas de objetos/refs para rechazar enlaces, sin leer sus blobs ni explorar otros checkouts. Límite 10 000 entradas por validación. Cada comando: 5 s y 1 MiB stdout+stderr; ante exceso, git_limit, sin retry. Repositorios mayores pueden rechazarse: ampliar sólo con evidencia. Git status puede leer archivos tracked para calcular cambios; no enumera untracked/ignored y usa ignore-submodules=all. ls-files detecta gitlinks sin abrir submódulos. No se implementa lectura/indexación del código.

## Evidencia reproducible

`pnpm.cmd build` y `pnpm.cmd --filter @beonforge/workspace test`: repositorios Git reales temporales, worktree, detached/unborn, reemplazos físicos, límites/permisos, Git env malicioso, fsmonitor, referencias versionadas y CLI en procesos separados. Inventarios SHA-256 comparan todos los archivos de fixtures, incluidos `.git/index`, `.git/config`, tracked, ignored y privados, antes/después. Mutaciones de preparación (init/commit/worktree/update-index/config) son exclusivamente fixtures previas al inventario; producto sólo inspecciona. Temporales propios eliminados tras cerrar stores. B03-02 no implementado.
