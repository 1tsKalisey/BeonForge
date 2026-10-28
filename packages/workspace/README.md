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
- Allowlist Git fija, argv separados, sin shell, pager ni locks opcionales. Config global/system y variables Git heredadas aisladas; fsmonitor, atributos/excludes externos y lazy fetch desactivados. No se cambia safe.directory. Includes, filtros, continuaciones de configuración, alternates y git-dir separado que no sea worktree se rechazan; no se ejecutan proveedores, hooks ni comandos externos definidos en configuración del repositorio.
- Config y config.worktree se validan primero con el parser oficial `git config --file <ruta> --no-includes --list --name-only -z`, bajo las mismas protecciones y límites. Se rechazan claves include/includeif/filter por su sección normalizada, incluidas mayúsculas, subsecciones y encabezados contiguos. --no-includes limita el parser explícito, pero el descubrimiento inicial por -C root todavía puede cargar includes externos (R-039 pendiente). Errores de parsing/salida inesperada fallan cerrado antes de status; el rechazo de continuaciones y los pins físicos se conservan.
- Sólo se leen pequeños archivos de configuración/punteros (256 KiB) y metadatos de identidad; se revisan entradas de objetos/refs para rechazar enlaces, sin leer sus blobs ni explorar otros checkouts. Límite 10 000 entradas por validación. Cada comando: 5 s y 1 MiB stdout+stderr; ante exceso, git_limit, sin retry. Repositorios mayores pueden rechazarse: ampliar sólo con evidencia. Git status puede leer archivos tracked para calcular cambios; no enumera untracked/ignored y usa ignore-submodules=all. ls-files detecta gitlinks sin abrir submódulos. No se implementa lectura/indexación del código.

## Seguimientos P3 de revisión (sin cambio funcional)

B03-01 aceptado y cerrado tras segunda auditoría APPROVE_WITH_FOLLOWUPS (2026-10-29); los cuatro P3 permanecen abiertos, no corregidos.

- **Descubrimiento/includes (R-039):** priorizar antes de repositorios no confiables. Candidato pendiente: ejecutar validación desde directorio privado sin descubrimiento de repositorio, conservando el runner aislado y demostrando ausencia de lecturas externas; no basta con --no-includes bajo -C root. Prerrequisito del plan B03-02.
- **Barras escapadas (R-040):** la comprobación de continuaciones puede rechazar valores legítimos con barras invertidas escapadas. Se conserva el rechazo conservador hasta una corrección con tests; no cambiar configuración legítima automáticamente para eludirlo.

- **Config con inode nuevo:** una edición normal con `git config` o un editor que publica por reemplazo puede cambiar el inode de `.git/config` (también aplica a config.worktree). Inspect conserva el pin y devuelve identity_changed aunque la edición sea legítima. Recuperación: revisar y confirmar manualmente los cambios/rutas/permisos, ejecutar de nuevo `project register` con el mismo --root, --storage y autorizaciones de metadatos, conservar la nueva referencia sha256+byteLength y usarla en inspect. No editar el descriptor viejo ni eludir los pins; el artefacto anterior permanece como evidencia. No hay registro automático ante cambios.
- **Muchos archivos tracked:** ls-files --stage -z devuelve una entrada por archivo tracked; puede superar 1 MiB stdout+stderr aunque sólo se necesite detectar gitlinks. Se devuelve git_limit sin resultados parciales ni retry; una referencia ya publicada permanece en CAS, pero inspect seguirá rechazándose mientras exceda el límite. El procesamiento incremental queda como seguimiento para un nodo posterior, sin aumentar límites, truncar salida ni implementar streaming en B03-01.

## Evidencia reproducible

`pnpm.cmd build` y `pnpm.cmd --filter @beonforge/workspace test`: repositorios Git reales temporales, worktree, detached/unborn, reemplazos físicos, límites/permisos, Git env malicioso, fsmonitor, referencias versionadas y CLI en procesos separados. Inventarios SHA-256 comparan todos los archivos de fixtures, incluidos `.git/index`, `.git/config`, tracked, ignored y privados, antes/después. Mutaciones de preparación (init/commit/worktree/update-index/config) son exclusivamente fixtures previas al inventario; producto sólo inspecciona. Temporales propios eliminados tras cerrar stores. B03-02 no implementado.

Corrección P1 `d73466b`: 34 tests nuevos, 57 workspace/312 totales. Reproducción definitiva previa: 16 casos de encabezados contiguos ejecutaban el marcador, más un test rojo de límite de claves. Verde: ningún filtro ejecutado desde register/inspect; incluye registro previo limpio y modificación in-place conservando inode antes de inspect, para no ocultar el bypass tras identity_changed. Config.worktree se prueba en un linked worktree real con extensions.worktreeConfig. El único control positivo ejecuta intencionalmente Git status sin protección para comprobar que la fixture sí activa su filtro Node inocuo, que sólo escribe un marcador dentro de su temporal. Configuración válida/malformada, mayúsculas/includeIf, continuaciones y salida expandida también cubiertas; tests contra build actual.
