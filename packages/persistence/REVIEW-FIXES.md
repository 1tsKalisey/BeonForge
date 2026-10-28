# M01.2 — Correcciones de revisión

Veredicto recibido: REQUEST_CHANGES. M01.2 permanece abierto; B02b-03 excluido.

Objetivo: reproducir y corregir F-5 (P1, validación/timeout), F-6 (P2, apertura de copias) y F-7 (P2, destinos anidados), un commit por hallazgo. Dependencia: B02b-02. Archivos: adaptador SQLite/worker, tests y registro de ejecución; contratos de dominio, dependencias, GC, streaming y runtime excluidos.

Aceptación: 800 eventos/40 checkpoints abren y respaldan sin watchdog fijo, verificaciones deduplicadas por operación y replay incremental; copias completas/incompletas no se abren como stores, restores requieren marcador válido; destinos dentro de SQLite/CAS rechazados antes de crear residuos. Mantener hashes, secuencia, idempotencia y crash recovery. Gates: regresiones rojo/verde, volumen con tiempos y conteos, frozen/peers/check/diff/secretos. Rollback: revertir correcciones puntuales conservando datos y schema. Siguiente nodo: nueva revisión independiente M01.2, sin cierre automático.

El paquete versionado anterior no incluye el informe externo: se usan F-5/F-6/F-7 proporcionados por el usuario. Seguimientos P3: entradas inesperadas en blobs deben producir diagnóstico fijo sin filtrar nombres; GC/retención, streaming/límites de memoria y ACL/power loss siguen pendientes, sin implementar capacidades nuevas ni atribuir IDs no recibidos.

## F-5 — Reproducción y cambio

Fixture `test/volume.test.ts` + `fixtures/recovery-volume.mjs`, 800 starts independientes, evidencia compartida y 40 checkpoints cada 20 eventos. Tras build: `pnpm.cmd --filter @beonforge/persistence exec vitest run test/volume.test.ts --silent=false`. Sólo temporales propios. Contadores sobre métodos compilados exclusivamente en el hijo de test, sin hooks productivos: reads cuenta verificaciones de referencias vía ArtifactFiles.read (excluye hashes de inventario/staging), applies eventos aplicados al reconstruir proyecciones. En operaciones worker se reporta tiempo; sus contadores internos no son observables desde el hijo.

Muestra Windows / Node 24.19.0 / SQLite 3.53.3, mismo equipo, antes (`2e5f9e3`) y después. Tiempos diagnósticos, no SLA. Los tests fijan límites de trabajo y éxito, no velocidad del equipo.

| Operación      | Antes ms / reads / applies             | Después ms / reads / applies |
| -------------- | -------------------------------------- | ---------------------------- |
| Populate       | 29366 / 50080 / 17200                  | 5283 / 920 / 17200           |
| Open directo   | 26223 / 50040 / 17200                  | 557 / 41 / 800               |
| Backup directo | 115215 / 197842 / 66400                | 1243 / 82 / 800              |
| Open worker    | 10018 / storage_failure                | 622 / éxito                  |
| Backup worker  | No alcanzable con apertura por defecto | 1236 / éxito                 |

Regresión roja original: apertura worker termina por watchdog fijo a 10 s sobre base válida. Primera fixture contenía effects=pure inválido: corregido a none antes de medir, no cuenta como reproducción. Corregido lint del test por destructuring inseguro de once().

Cambio: validación integral única al abrir, caché SHA/bytes local a cada operación que comprueba longitud en cada referencia; checkpoints ordenados con un replay y reconstrucción atómica. Load individual contrasta su prefijo; ninguna caché sobrevive a la operación. Backup valida el conjunto copiado una sola vez; restore mantiene hash/identidad de fuente antes/después de copia asíncrona y validación independiente del destino. Inventario verificado conserva bytes para copia sin releer fuente; persiste límite de memoria sin streaming.

SqliteTimeoutPolicy es aditivo: openSqlitePersistence tercer argumento, openSqliteEventStore segundo, restoreSqliteBackup tercero. Defaults finitos: openingMs/queueMs=120000, executionMs=30000, backupMs/restoreMs=300000; enteros 1..2147483647, sin desactivar watchdog. Cliente despacha una operación cada vez: queueMs mientras no enviada, después presupuesto de su clase. Cola expirada devuelve queue_timeout sin envío ni matar trabajo activo. Mutación enviada con timeout sigue outcome_unknown y cierra worker, sin retry; pendientes no enviados son fallos conocidos. Worker conserva serialización.

Regresiones: cola expirada sin escritura, deadline real con lock SQLite/estado incierto sin retries, apertura configurable, restauración, configuración inválida, prefijos iguales/antiguos y longitudes contradictorias bajo SHA compartido. F-6/F-7 siguen abiertos hasta sus commits separados.

Gates F-5: frozen, peers y check completos verdes, 62 contratos + 57 persistencia + 7 spike = 126 tests. Formato detectó inicialmente la tabla Markdown nueva; corregido antes del check verde. Diff/alcance y secretos revisados. El volumen además restaura y reabre 800 eventos/40 checkpoints; el resto de integraciones de corrupción/crash continúa verde.

## F-6 — Apertura de conjuntos de recuperación

Reproducción antes del cambio: 9/9 regresiones rojas; se aceptaban backups completos/incompletos, restores sin ready o con ready inválido/futuro/adelantado, sin DB/CAS y directorios reservados vacíos. El rechazo ahora sucede antes de inicializar CAS/SQLite. Backups se identifican por nombre reservado, manifest o marcador incompleto y nunca son stores públicos. La validación interna de copias usa un modo privado distinto de la apertura pública.

Restores requieren ready JSON estricto v1, DB/CAS existentes, nombres de DB/CAS esperados, schema/application_id válidos y head al menos igual al prefijo ready. No se migra/inicializa una copia identificada como restore. Se conserva un marcador de origen para identificarla incluso renombrada; no es firma ni autorización frente al propietario privilegiado. Restores v1 anteriores con ready válido siguen admitidos sin exigir el nuevo marcador. Incomplete siempre falla cerrado; ready no es checkpoint de ejecución ni head futuro del store.

11 regresiones nuevas verdes: incluyen renombrado sin ready, intento de DB/CAS alternativos sin residuos y reapertura de restore válido después de appends. Los kills previos de backup/restore y la copia de volumen se mantienen. F-7 sigue pendiente de su corrección separada.

Gates F-6: frozen/peers/check verdes, 62 + 68 + 7 = 137 tests. El primer check detectó dos fallos de reapertura con CAS explícito por alias Windows 8.3 frente a nombre largo; comparación corregida con realpath nativo y pruebas completas posteriores verdes. Sin cambios a contratos/dependencias ni datos reales.
