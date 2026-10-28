# B02a-01 — Spike SQLite

Objetivo: evaluar `node:sqlite` de Node 24 para almacenamiento durable local; dependencia M01.1 cerrada. Experimento aislado, no EventStore ni abstracción de persistencia. Archivos: este directorio, script/gate raíz y memoria de ejecución. Excluidos contratos, datos reales, B02b, proveedores y UI. Rollback: revertir commits del spike; conservar contratos aceptados.

Ejecutar `pnpm.cmd test:sqlite-spike` (incluido en `pnpm.cmd check`). Usa `node:test` y módulos nativos en `.mjs` para evaluar directamente el binario, sin paquete productivo ni dependencias nuevas. ESLint/Prettier cubren el spike; no se introduce código de aplicación fuera de TypeScript. Sólo se crean directorios únicos `beonforge-sqlite-spike-*` bajo el temporal del sistema, eliminados tras cerrar conexiones e hijos.

Aceptación: WAL efectivo, transacciones/rollback/reapertura, UNIQUE/idempotencia sin duplicados, snapshots de lectores con escritor activo, exclusión de escritores/SQLITE_BUSY y reintento tras liberar lock; kill abrupto con COMMIT confirmado y otra transacción pendiente bajo FULL/NORMAL, integrity_check y migración versionada atómica. Medir FULL/NORMAL y bloqueo del event loop sin umbrales de rendimiento frágiles. Decisión y limitaciones sólo tras resultados; siguiente B02b-01 si se satisfacen sus prerequisitos.

## Resultados reproducidos — 2026-10-28

Windows x64, archivos temporales locales. Dos ejecuciones independientes de 7/7 tests:

| Binario                                | SQLite real                | Resultado                                                                             |
| -------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------- |
| Node 24.13.0 instalado                 | 3.50.4; aviso experimental | Todas las pruebas pasan; versión no aprobada para persistencia durable por WAL-reset. |
| Node 24.19.0 portátil, ya fijado en CI | 3.53.3                     | Todas pasan; candidato seleccionado sin cambiar instalación global.                   |

El portátil procede de `https://nodejs.org/download/release/v24.19.0/win-x64/node.exe`; SHA-256 comprobado contra el [listado oficial](https://nodejs.org/download/release/v24.19.0/SHASUMS256.txt): `3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237`. Para reproducir con otro binario, ejecutar `<node-verificado> --test spikes/sqlite/sqlite.test.mjs`; el fork y el worker usan ese mismo runtime.

- `journal_mode` devuelve `wal` y cada conexión comprueba `synchronous` (FULL=2, NORMAL=1). DDL y user_version se revierten juntos ante error y sobreviven juntos al commit/reabrir (migración 1→2).
- Cinco reintentos de la misma idempotency key producen una sola operación/proyección. UNIQUE rechaza inserción duplicada sin ON CONFLICT; una segunda conexión repite la clave tras SQLITE_BUSY sin insertar duplicado. La política de detectar payload distinto bajo una misma clave sigue siendo B02b; DO NOTHING aquí es sólo una primitiva SQL, no una API de deduplicación de producto.
- Dos lectores abiertos ven datos confirmados, nunca escrituras pendientes. Un snapshot explícito conserva su vista incluso después del commit del escritor; se actualiza al cerrar su transacción. Otro escritor recibe error SQLite primario 5 (BUSY), identificado por errcode, no por mensaje; tras liberar lock puede escribir. El timeout de 75 ms se midió en 133.27/142.27 ms: no es un deadline estricto.
- En FULL y NORMAL, el hijo confirma una operación/proyección, escribe 16 filas de 64 KiB y una proyección en otra transacción, informa por IPC y recibe SIGKILL sin close/rollback. WAL queda en disco; al reabrir hay una operación/proyección confirmada, cero filas pendientes, cero cambios al repetir la clave y `integrity_check=ok`. Cache pequeña ejercita spilling de páginas. No se simula pérdida de alimentación ni crash del SO.
- Cada caso verifica `integrity_check=ok`; no demuestra ausencia de fallos raros ni corrección de almacenamiento real bajo cualquier hardware.

### FULL frente a NORMAL

Workload fijo: 3 rondas/modo con orden alterno; 100 transacciones por ronda, dos inserts y payload de 128 bytes por transacción. Sin auto-checkpoint; checkpoint TRUNCATE medido aparte. Muestras de la ejecución independiente portátil Node 24.19.0, antes de gates integrados:

| Modo   | Ronda | Mediana ms/tx | p95 ms/tx | Total 100 tx ms | Checkpoint ms |
| ------ | ----- | ------------- | --------- | --------------- | ------------- |
| FULL   | 0     | 1.8860        | 2.1275    | 191.29          | 3.08          |
| FULL   | 1     | 1.8881        | 2.1074    | 190.94          | 2.94          |
| FULL   | 2     | 1.8954        | 2.1687    | 193.18          | 2.84          |
| NORMAL | 0     | 0.0312        | 0.0799    | 4.02            | 5.81          |
| NORMAL | 1     | 0.0302        | 0.0650    | 3.73            | 5.58          |
| NORMAL | 2     | 0.0307        | 0.0703    | 3.82            | 5.65          |

Son observaciones locales, no SLA ni comparación universal; caché, disco y carga afectan los resultados. No se exige que NORMAL gane en un test. En el instalado 24.13.0, las medianas fueron FULL 1.8728–1.9100 ms y NORMAL 0.0304–0.0325 ms.

Según [SQLite synchronous](https://sqlite.org/pragma.html#pragma_synchronous), WAL/FULL añade sincronización por commit; WAL/NORMAL puede perder commits ante caída de alimentación/SO aunque conserve consistencia. Ambas configuraciones sobreviven al crash de aplicación probado. FULL depende de que filesystem/hardware cumplan sus garantías de sincronización; el SIGKILL no prueba eso.

### Event loop y decisión

DatabaseSync bloqueó el timer principal durante la espera BUSY completa. En el worker, el timer principal pudo liberar el escritor mientras SQLite esperaba; espera medida 49.97/39.36 ms. El experimento demuestra aislamiento del bloqueo, no una cola productiva, control de carga ni cancelación de consultas.

**Adoptar `node:sqlite` para B02b con Node 24.19.0/SQLite 3.53.3 verificados, WAL + synchronous=FULL y una conexión escritora serializada en worker dedicado.** No hace falta evaluar otra librería tras estos resultados. El siguiente paso debe fijar/verificar el runtime antes de abrir datos reales; el rango amplio actual del manifest no garantiza una SQLite parcheada. No se crea aún worker/puerto/EventStore de producto.

[SQLite documenta el WAL-reset bug](https://sqlite.org/wal.html#walreset) en versiones hasta 3.51.2, con correcciones desde 3.51.3 y backports 3.50.7/3.44.6. Afecta carreras de write/checkpoint entre conexiones de distintos threads/procesos. La 3.50.4 instalada cae en ese rango: aprobar la API no aprueba ese binario. Las pruebas de este spike no reproducen ni descartan ese bug; no se usan para eximir la actualización.

En B02b: un escritor efectivo, timeout acotado y manejo de BUSY sin retry ciego, WAL en filesystem local, política de checkpoints/backup y correlación/idempotencia de producto verificables. Worker necesario para no bloquear el futuro control plane; no pool distribuido. Consultas síncronas siguen bloqueando su worker y no se cancelan por recibir mensajes. Reconsiderar driver/runtime ante fallo de estos gates o cambios incompatibles de la API. [Node 24.13](https://nodejs.org/download/release/v24.13.0/docs/api/sqlite.html) describe DatabaseSync y su timeout; [Node 24.19](https://nodejs.org/download/release/v24.19.0/docs/api/sqlite.html) clasifica SQLite como release candidate, no API estable definitiva.
