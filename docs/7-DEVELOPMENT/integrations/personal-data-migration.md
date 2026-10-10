# Registro Firebase y preservación de los datos personales

Estado: 2026-10-10. Fork personal, instalación local. No se activó facturación ni se hizo una transferencia cloud.

## Decisión actual del propietario

Continuar trabajando en local por defecto. Conservar el volumen `notebook_data` y SurrealDB como almacenamiento operativo. Las cuentas Firebase pueden probarse en `/register` y `/account/login` cuando el servidor dispone de configuración web y credenciales. El modo obligatorio Firebase se activa explícitamente con `NEXTNOOTBOOK_AUTH_MODE=firebase` y todavía es staging privado, no SaaS público.

La cuenta administradora se asigna en el servidor únicamente cuando Firebase confirma el email verificado configurado en `NEXTNOOTBOOK_ADMIN_EMAIL`. No se crea una contraseña por el propietario ni se marca un email como verificado sin su acceso. Entrar con Google es el paso más directo para verificar la identidad. Al iniciar sesión por primera vez con el email administrador verificado, un manifiesto privado vincula la instalación local a ese UID de manera inmutable; la aplicación no borra ni reescribe los cuadernos. No confundir autorización del CLI con una cuenta del producto.

## Inventario local confirmado

- 5 cuadernos, 67 fuentes y 67 relaciones fuente/cuaderno.
- 7 notas, 9 exámenes, 8 intentos de examen.
- 3 sesiones de chat, 6 tests del chat y 5 intentos.
- 2.861 embeddings y 58 resultados de transformación/insights de fuentes.
- Ninguna fuente con archivo faltante en la copia.
- Se conservaron además modelos, configuración, relaciones, trabajos y credenciales cifradas en la exportación completa.

Respaldo privado: `.firebase/backups/2026-10-10/`. Ignorado por Git y por el contexto de Docker. La exportación SurrealQL preserva schema y registros; `records.json` conserva una representación por tabla y los archivos incluyen SQLite/checkpoints. El respaldo completo también contiene cachés locales, que no hace falta trasladar a la nube. El material de restauración de cifrado se conserva únicamente en local, con permisos privados.

El inventario para transferencia contiene 72 archivos y aproximadamente 551 MB, incluidas la exportación original, su copia restaurable y el historial. Una copia local en este equipo no sustituye un respaldo externo contra pérdida del disco.

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
  --snapshot .firebase/backups/2026-10-10 \
  --project nextnootbook-dev \
  --email admin@example.com
```

Sin `--execute` solo lee datos y genera un informe privado; no usa Firebase ni elimina archivos. Comprueba referencias de archivos y la integridad de SQLite.

## Transferencia posterior

Requiere cuenta Firebase verificada con claim administrador, bucket Storage habilitado, Firestore y permisos de servidor limitados a estos recursos. No activar facturación sin decisión del propietario. Deployar las reglas privadas antes de comenzar; no usar reglas abiertas.

```bash
GOOGLE_APPLICATION_CREDENTIALS=/ruta/privada/service-account.json \
uv run python firebase/migrate_personal_data.py \
  --snapshot .firebase/backups/2026-10-10 \
  --project nextnootbook-dev \
  --bucket BUCKET_CONFIRMADO \
  --email admin@example.com \
  --execute
```

El destino está bajo `users/UID/migrations/HASH`, tanto en Storage como en Firestore. La herramienta resuelve el UID desde Firebase y comprueba email verificado/rol; no toma el UID de una solicitud del navegador. Descarga cada archivo para comparar SHA-256 y tamaño, relee cada registro y verifica cantidades por tabla. Nunca borra los originales. El informe marca `verified-copy`, no migración operativa completada. Si falla, mantiene una marca de fallo y permite reintentar.

## Para terminar una migración operativa completa

Falta implementar y verificar el repositorio Firebase utilizado por las consultas del producto, incluyendo relaciones, búsqueda vectorial, trabajos y checkpoints. La exportación cloud por sí sola no cambia dónde lee/escribe la aplicación. Hacer una restauración independiente, comparar respuestas, congelar escrituras y tomar una copia final antes del cambio. Conservar ambos orígenes y un camino de rollback.

El producto no está listo para despliegue SaaS público hasta resolver también aislamiento por cuenta, límites de uso/modelo, HTTPS y configuración de pagos. Un miembro nuevo no puede acceder al almacén compartido en modo Firebase; ve su cuenta creada mientras se prepara su espacio privado.

## Pruebas

```bash
uv run pytest tests/test_auth.py tests/test_firebase_auth.py -q
PYTHONPATH="$PWD" GOOGLE_APPLICATION_CREDENTIALS="$PWD/.firebase/runtime-service-account.json" \
  npx -y firebase-tools@15.33.0 emulators:exec --project demo-nextnootbook --only auth \
  'uv run python firebase/check-account-sessions.py'
```

La prueba real usa únicamente un proyecto demo y loopback. Verifica sesión Firebase, promoción de administrador verificado, rechazo de acceso a material ajeno, rechazo de cuentas deshabilitadas y logout.
