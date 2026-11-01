# Fase 04 — Primera vertical de bugfix

Estado: **PREPARADA / NO INICIADA**. Sólo planificación documental autorizada; ninguna ejecución de esta vertical. Dependencia Fases01–03 satisfecha por cierres aceptados, incluido D-042/643 tests y gates finales de03. Fuente normativa: master-plan, fila04, **«Workflow sobre fixture: reproducir, test rojo, cambio, gates, revisión y rollback»**. No se altera ese criterio ni se adelanta la fila05.

Actualización operativa: propietario autoriza implementar exclusivamente M04.1. Archivos: examples/bugfix y tests/README/package scripts/tsconfig.test de runtime, enlace workspace de desarrollo y documentos de ejecución. Ningún cambio al kernel/contratos aceptados. Demo TypeScript ejecutada con Node24 aprobado y typechecked junto a tests; CLI fija sin módulos/comandos arbitrarios. Preparación sobre padre privado vacío explícito; revisión pendiente por defecto, approve/discard sólo con decisión y grants propios ligados a raíz/hash de evidencia. Gates completos/643 anteriores y nuevas integraciones; rollback acotado de commits de demo conservando evidencias, sin borrar datos reales. No05 ni cierre automático04; siguiente gate revisión independiente. El texto de preparación inferior es el plan aprobado, no evidencia de ejecución.

## Primer y único nodo propuesto — M04.1

**M04.1 — Vertical bugfix determinista sobre fixture autorizado.** El plan no asignaba un identificador de tarea a04; se reutiliza el patrón de milestone M01.1/M01.2/M01.3 como nodo mínimo, sin inventar un bloque de producto ni reasignar B04 (harness, Fase05). Preparado para implementación posterior expresamente solicitada, no iniciado por este documento.

### D-043 — Repositorio sintético necesario, todavía no creado

**Sí es necesario crear un nuevo repositorio de pruebas** para demostrar Git/worktrees y un cambio real sin usar proyectos existentes. Se creará sólo cuando se autorice implementar/ejecutar M04.1. Los archivos bajo examples serán plantillas sintéticas propias; no se clona, copia, inspecciona o reutiliza ningún otro proyecto y no se convierte BeonForge en objetivo del agente. Los gates del producto siguen siendo mantenimiento de BeonForge, separados de la evaluación del proyecto objetivo.

Estructura mínima prevista, toda dentro de una raíz privada de pruebas explícitamente autorizada (marcador documental, no ruta creada ni autorización automática de todo TEMP):

```text
<AUTHORIZED_TEST_ROOT>/<run-id>/
  project/                 # git init local nuevo, sin remotos
    .git/                  # metadata común autorizada separadamente
    .gitignore
    package.json           # fixture mínimo, sin dependencias ni scripts arbitrarios
    src/add.ts             # suma con bug sintético conocido
    test/add.test.mjs       # regresión sintética conocida
  worktrees/fix/           # nuevo, nunca un checkout existente
  storage/                 # SQLite y CAS privados, fuera del worktree
  evidence/                # reportes/diff saneados
  process/                 # HOME/TEMP de procesos de prueba cuando corresponda
```

Criterios de aislamiento para la futura demo:

- Autorizar y registrar rutas canónicas exactas/identidades de raíz, project, .git/common-dir, destino, storage/evidence y ubicaciones auxiliares. Comprobar parentesco físico antes de crear/escribir/ejecutar, revalidar en cada operación sensible; rechazar symlinks, junctions, aliases Windows ambiguos, sustituciones y escapes por rutas/configuración Git. Fallar cerrado sin tocar ubicaciones ajenas.
- Sólo git init local y commits del fixture sintético; sin clone/fetch/push, remotos, submódulos, hooks, includes/filtros ejecutables, gestores de paquetes o descubrimiento de proyectos. Sin acceso a otros checkouts ni código/datos copiados. Mantener separado el repo original del fixture de su worktree de ejecución.
- Procesos fijos confiables, argv sin shell, entorno mínimo sin credenciales ni variables de inyección, cwd/HOME/TEMP autorizados, límites de tiempo/salida y ausencia de peticiones de red/servicios externos. Ninguna base real, token, cuenta de proveedor o repositorio remoto. Cualquier excepción posterior exige decisión expresa, no se deriva de un plan de integración.
- La raíz y el entorno de proceso **no son un sandbox del SO**: Node puede acceder a recursos del usuario si se ejecuta código arbitrario. Por eso04 se limita al fixture y handler propios conocidos; no ejecutar agentes/código no confiable si no se puede demostrar el confinamiento requerido. Documentar el límite como dependencia, nunca garantizar aislamiento por worktree/cwd/HOME.
- Tests de aceptación futuros: sentinelas sintéticos fuera de cada subraíz concedida, denegaciones de escapes/enlaces/identidad/configuración, cero acceso/efecto fuera de la raíz permitida y cero solicitudes externas para las operaciones ensayadas. No usar otro proyecto para demostrar esas denegaciones. Estas pruebas observan casos concretos; no prueban sandbox universal.
- Éxito no habilita proyectos reales automáticamente. Antes de cualquier entorno real: nueva decisión expresa del propietario, evaluación de seguridad y autorización concreta de proyecto/operaciones. D-043 se mantiene en05 y demos posteriores; no crear una plataforma de gestión de entornos.

### Objetivo y demostración

Una tarea pública concreta corrige una suma defectuosa en un fixture TypeScript mínimo. Flujo observable: tarea → proyecto Git temporal registrado → worktree detached confirmado → selección tracked explícita/ContextPackage e instrucciones/ContextEnvelope → test rojo inequívoco → cambio determinista autorizado → test verde → diff/evidencias CAS → revisión humana → rollback inverso autorizado y verificado en el fixture.

La intervención es un handler confiable que aplica una corrección fija y revisable; **no simula un agente**, no genera código mediante Ollama y no demuestra capacidad de programación del modelo. La revisión puede permanecer pendiente hasta recibir decisión humana; el éxito técnico no equivale a aprobación/merge. El rollback se demuestra en el entorno temporal con autorización explícita, no como limpieza automática de un fallo.

### Entradas y salidas mínimas

- Entradas: fixture público versionado (package.json, .gitignore regular, src/add.ts, test/add.test.mjs), commit exacto; descripción del bug y test de regresión; raíces privadas autorizadas de proyecto/Git/común/ejecución/storage; grants vivos de workspace/contexto; runId y referencias CAS; autorización limitada del cambio fijo y del proceso de tests. No secretos, scripts de proyecto arbitrarios o repositorios reales ajenos.
- Salidas: ContextPackage/Envelope existentes, eventos/checkpoints del workflow y RunReport; artefactos de test rojo/verde, diff limitado y resumen JSON v1 de evidencia (runId, commit, referencias de intención/receipt/contexto, archivo y hashes anterior/posterior, comandos/exit codes, revisión pendiente/decisión humana si se aporta). Ninguna referencia concede permiso. No nuevo schema de dominio ni sistema de aprobaciones general.
- Evidencia de rollback: decisión explícita, preimagen del parche inverso verificada, bytes originales restaurados sólo en el archivo autorizado, resultado esperado del test nuevamente rojo y diff tracked vacío respecto al commit base. No git reset/clean/force ni borrado automático de worktrees.

### Reutilización y componentes previstos

| Disponible | Uso en M04.1 / límite |
|---|---|
| Fase01: executeWorkflow, Workflow/BlockManifest/BlockHandler/BlockResult, EventStore/ArtifactStore/checkpoints | DAG secuencial y evidencias reales, reabrir/reconocer resultados confirmados. Pending/uncertain bloquean; no reconstruir kernel/reconciliador. |
| Fase02: registerProject/inspectProject, prepareWorktree/createWorktree/inspectWorktree | Identidades/permisos y checkout nuevo aislado. Conservar receipt histórico y comprobar estado actual en cada paso sensible. |
| Fase02: build/readContextPackage y build/readContextEnvelope | Selección pública explícita desde commit clean, permisos propios de lectura/publicación, OID y CAS verificados. Contexto histórico no autoriza checkout vivo ni envío. |
| Fase03: probe/inferencia sintética/registry aceptados | Prerrequisito satisfecho; no se invocan ni conceden capacidad de código. La vertical no necesita otro modelo, inferencia ni acceso a Ollama. |
| Fase05: harness Codex/OpenCode, perfiles/contract tests | Reservado. La tarea con intervención de un agente externo aún no es ejecutable; requiere05 y autorizaciones/controles propios. |

Archivos previstos para la futura implementación: demo y fixture bajo `packages/runtime/examples/bugfix/`, tests de integración bajo `packages/runtime/test/` y documentación de la demo. Conectar las APIs existentes desde la demo/handlers del fixture; no importar proveedores al dominio ni workspace al núcleo genérico del runtime. Sólo enlaces workspace de desarrollo si los necesitan los ejemplos/tests, sin dependencias externas nuevas. No ampliar la CLI general para aceptar módulos o comandos arbitrarios. Formatos Workflow/BlockManifest/BlockResult existentes; resumen de evidencia local a la demo, sin catálogo, framework de patches ni nuevas APIs generales.

### Secuencia y límites de seguridad

1. Crear fixture Git público en temporal controlado; autorizar raíces exactas y comprobar commit/identidades. Preparar intención y crear worktree por B03, sin modificar checkout/índice/config original; se esperan sólo metadatos administrativos de Git compartidos.
2. Con worktree históricamente confirmado y actualmente clean, preparar contexto/envelope de archivos tracked seleccionados; conservar referencias. Coincidencia exacta de rutas/case/OID, raíces y permisos; no leer untracked/ignored, symlinks, junctions ni rutas privadas. Respetar límites existentes de contexto y árbol.
3. Ejecutar exclusivamente el test fijo del fixture mediante process.execPath con argv separados, sin shell ni npm scripts/hooks/filtros. Cwd y binario confiables, entorno mínimo sin credenciales, timeout/cancelación y salidas acotadas/saneadas. Debe fallar por la aserción esperada de suma, no por error de importación, sintaxis, timeout u otro fallo de infraestructura.
4. Autorizar handler externo concreto mediante los contratos existentes y una allowlist local del fixture; **RunOptions.external no es un sandbox ni permiso general de herramienta**. Revalidar identidad/rutas/estado y hash de preimagen; aplicar una única corrección fija a src/add.ts. Registrar el inicio durable antes del efecto; ante resultado incierto, bloquear sin retry ni rollback automático. No crear un motor genérico de edición.
5. Revalidar identidad y la postimagen exacta autorizada antes de tests/diff. El checkout puede estar modified por el único cambio esperado: eso no borra confirmación histórica ni concede nuevas operaciones. Drift HEAD/identidad, cambios inesperados u operación incierta bloquean. Test de regresión conservado sin editar; verde sólo si el proceso termina correctamente y la aserción original pasa.
6. Presentar diff de un único archivo y referencias/test reports para revisión humana, sin commits/merge/push. Rechazo/ensayo de rollback requiere decisión expresa sobre ese archivo temporal y coincidencia de postimagen; verificar parche inverso sin tocar archivos ajenos. Si hay drift o incertidumbre, sólo informar y detener.

Los worktrees **no aíslan procesos/red/credenciales**. Esta primera vertical sólo ejecuta código público de fixture controlado por BeonForge y procesos Node fijos; repositorios/tests no confiables, gestores de paquetes, ejecución de herramientas arbitrarias y egress requieren una frontera posterior antes de habilitarse. No afirmar sandbox ni hacer extensible ese permiso por datos del repo, contexto, registry o resultados del modelo.

### Aceptación y tests mínimos verificables

- Integración real temporal: registro → worktree → contexto/envelope → rojo por aserción concreta → parche conocido → verde → diff exacto y resumen verificable en CAS. Reapertura/segundo proceso recupera reportes y mismos artefactos; el original permanece intacto salvo metadatos comunes autorizados.
- Denegaciones sin efecto: grants ausentes/revocados, fuera de raíz/case incorrecto/symlink o identidad sustituida, worktree incierto/drift y preimagen diferente; no mutar archivo ni iniciar proceso. No se considera clean evidencia de ausencia de untracked/ignored.
- Fallos reales: test no reproducible o infraestructura rota impiden parche; timeout/cancelación/exit inesperado impiden declarar verde. Salidas limitadas y errores tipados sin valores privados; no procesos/red/inferencias/descargas inesperados.
- Corte entre efecto y confirmación: reabrir y constatar pending/uncertain bloqueado sin reejecutar cambio; reinicio tras resultado confirmado no repite el handler. Reutilizar protocolo existente, sin prometer atomicidad CAS/SQLite/filesystem o exactly-once.
- Revisión/rollback: resultado técnico no aprueba cambios; sin decisión no hay integración ni reversión. Inverso explícito en fixture confirmado restaura bytes/diff base y rojo esperado; postimagen alterada impide sobrescribir. Nada de limpieza destructiva automática.
- Gates completos oficiales Node24.19.0/pnpm12.15.0, suite anterior intacta más integraciones de vertical, diff/secretos y paquete de revisión independiente. Caso limpio reproducible, no sólo interfaces/mocks.

### Dependencias, bloqueos y rollback del nodo

Fases01–03 cerradas y autorización posterior para implementar la demo son los prerrequisitos. No existe dependencia técnica de05 para el cambio fijo del fixture. Bloqueantes reales en una ejecución futura: identidad/grants no verificables, falta de autorización del efecto/test/rollback, test rojo no reproducible, efectos inciertos o gate fallido. R-049/055/056/057/061/065/066 siguen aceptados dentro de su alcance; ninguno concede permisos operativos. R-061 pasa a bloqueo si se reproduce un fallo de gate.

Para ampliar a un agente real: Fase05 deberá aportar adaptador oficial, permisos de herramientas/proceso/red, autenticación compatible, control de efectos, cancelación y recuperación sin retry unknown, más autorización explícita de datos/destino. D-036 no autoriza envío de ContextPackage. No bloquear la demo determinista por exigir anticipadamente esos harness, ni afirmar que ya existen.

Rollback de implementación: commit inverso acotado de demo/tests, conservar evidencias y datos de usuario; no reset, eliminación o sobrescritura automática. Siguiente capacidad demostrable: un bugfix real pequeño con rojo/verde, contexto y diff inspeccionables, revisión/rollback humanos; siguiente gate tras implementarlo será su revisión independiente. No se crean otros nodos ni se inicia04 en este cierre documental.
