# Registro Firebase y preservación de los datos personales

Estado: 2026-10-10 (Argentina). Fork personal, aplicación local. El propietario habilitó Storage y se provisionó Firestore privado. La copia completa finalizó con estado `verified-copy`: 3.435 registros y 73 archivos releídos y verificados. Los originales locales se conservan.

## Decisión actual del propietario

Continuar trabajando en local por defecto. Conservar el volumen `notebook_data` y SurrealDB como almacenamiento operativo. Las cuentas Firebase pueden probarse en `/register` y `/account/login` cuando el servidor dispone de configuración web y credenciales. El modo obligatorio Firebase se activa explícitamente con `NEXTNOOTBOOK_AUTH_MODE=firebase` y selecciona espacios privados por cuenta. Hosting y dominio siguen sin configurarse.

La cuenta administradora se asigna en el servidor únicamente cuando Firebase confirma el email verificado configurado en `NEXTNOOTBOOK_ADMIN_EMAIL`. No se crea una contraseña por el propietario ni se marca un email como verificado sin su acceso. Entrar con Google es el paso más directo para verificar la identidad. Al iniciar sesión por primera vez con el email administrador verificado, un manifiesto privado vincula la instalación local a ese UID de manera inmutable; la aplicación no borra ni reescribe los cuadernos. No confundir autorización del CLI con una cuenta del producto.

## Inventario local confirmado

- 5 cuadernos, 67 fuentes y 67 relaciones fuente/cuaderno.
- 7 notas, 9 exámenes, 8 intentos de examen.
- 3 sesiones de chat, 6 tests del chat y 5 intentos.
- 2.861 embeddings y 58 resultados de transformación/insights de fuentes.
- Ninguna fuente con archivo faltante en la copia.
- Se conservaron además modelos, configuración, relaciones, trabajos y credenciales cifradas en la exportación completa.

Respaldo privado: `.firebase/backups/2026-10-10/`. Ignorado por Git y por el contexto de Docker. La exportación SurrealQL preserva schema y registros; `records.json` conserva una representación por tabla y los archivos incluyen SQLite/checkpoints. El respaldo completo también contiene cachés locales, que no hace falta trasladar a la nube. El material de restauración de cifrado se conserva únicamente en local, con permisos privados.

El respaldo actualizado para transferencia contiene 73 archivos y 550.704.689 bytes, incluidas la exportación original, su copia restaurable y el historial. El respaldo actualizado está en `.firebase/backups/2026-10-11-cloud-000038/` (fecha UTC); el anterior conserva además todas las cachés. El archivo privado `.firebase/current-cloud-snapshot.txt` selecciona la copia actual.

## Copia restaurable de SurrealDB

El exportador instalado (SurrealDB 2.7.0) emite definiciones duplicadas para campos generados de relaciones y arrays. Se preserva el export original y se genera una copia separada que añade `OVERWRITE` a las definiciones de campos, dentro de los bloques de schema, sin modificar registros. Es el [problema de exportación documentado por SurrealDB](https://github.com/surrealdb/surrealdb/issues/6075).

```bash
uv run python firebase/prepare_surreal_restore.py \
  .firebase/backups/2026-10-10/database.surrealql \
  .firebase/backups/2026-10-10/database.restore.surrealql
```

La herramienta se niega a sobrescribir el original o una copia existente; también retira el mensaje de log que el CLI añade al final de stdout. La restauración aislada confirmó las cantidades de todas las tablas y los hashes equivalentes de los 3.435 registros, sin diferencias. Antes de una restauración real usar un namespace aislado y verificar todos los registros y relaciones. Nunca importar el archivo encima de la base operativa.

## Verificar antes de cualquier transferencia

```bash
uv run python firebase/migrate_personal_data.py \
  --snapshot RUTA_DEL_RESPALDO_VERIFICADO \
  --project nextnootbook-dev \
  --email admin@example.com
```

Sin `--execute` solo lee datos y genera un informe privado; no usa Firebase ni elimina archivos. Comprueba referencias de archivos y la integridad de SQLite.

## Transferencia verificada

Requiere cuenta Firebase verificada con claim administrador, bucket Storage habilitado, Firestore y permisos de servidor limitados a estos recursos. Storage fue habilitado explícitamente por el propietario; la aplicación sigue ejecutándose en local. Deployar las reglas privadas antes de comenzar; no usar reglas abiertas.

```bash
GOOGLE_APPLICATION_CREDENTIALS=/ruta/privada/service-account.json \
uv run python firebase/migrate_personal_data.py \
  --snapshot RUTA_DEL_RESPALDO_VERIFICADO \
  --project nextnootbook-dev \
  --bucket BUCKET_CONFIRMADO \
  --email admin@example.com \
  --execute
```

El destino está bajo `users/UID/migrations/HASH`, tanto en Storage como en Firestore. La herramienta resuelve el UID desde Firebase y comprueba email verificado/rol; no toma el UID de una solicitud del navegador. Descarga cada archivo para comparar SHA-256 y tamaño, relee cada registro y verifica cantidades por tabla. Nunca borra los originales. El informe marca `verified-copy`, no migración operativa completada. Si falla, mantiene una marca de fallo y permite reintentar.

## Archivos operativos y datos de producto

[ADR-026](../decisions/ADR-026-private-study-workspaces.md) conserva SurrealDB como repositorio operativo de relaciones, búsquedas vectoriales, exámenes y cuadernos. Firebase guarda identidad, originales privados y el archivo histórico completo verificado en Firestore/Storage. SQLite conserva checkpoints y el ledger de uso en el volumen persistente. La copia completa cloud no cambia estas consultas ni vuelve descartables los volúmenes.

Después de un informe `verified-copy`, conectar los originales a las rutas privadas utilizadas por el producto:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/ruta/privada/service-account.json \
uv run python firebase/activate_verified_files.py \
  --snapshot RUTA_DEL_RESPALDO_VERIFICADO \
  --project nextnootbook-dev \
  --bucket BUCKET_CONFIRMADO \
  --email admin@example.com
```

La herramienta compara el manifiesto local con el remoto, copia cada generación original sin sobrescribir y descarga/verifica otra vez SHA-256. El informe privado `firebase-runtime-files-report.json` marca `verified-runtime-files`. Los archivos originales se conservan; 67 fuentes pueden referenciar 66 archivos únicos. La conexión operativa quedó verificada para los 66 archivos: 137.850.021 bytes. La cuota de la cuenta propietaria fue reconstruida con esos tamaños. Se comprobó una descarga desde Firebase hacia una caché temporal vacía, comparando SHA-256 y conservando el original local.

Las nuevas cuentas verificadas reciben su propio espacio sin acceso a los cuadernos del propietario. La futura exposición pública exige modo Firebase obligatorio, HTTPS y volúmenes persistentes. Los pagos todavía requieren integrar y configurar un proveedor.

## Pruebas

```bash
uv run pytest tests/test_auth.py tests/test_firebase_auth.py -q
PYTHONPATH="$PWD" GOOGLE_APPLICATION_CREDENTIALS="$PWD/.firebase/runtime-service-account.json" \
  npx -y firebase-tools@15.33.0 emulators:exec --project demo-nextnootbook --only auth \
  'uv run python firebase/check-account-sessions.py'
```

La prueba real usa únicamente Auth demo y loopback, con un namespace SurrealDB de pruebas separado. Verifica sesiones, administrador, cuadernos privados, rechazo de lectura/escritura/borrado cruzados, checkpoints, trabajos firmados, cuotas y logout.
