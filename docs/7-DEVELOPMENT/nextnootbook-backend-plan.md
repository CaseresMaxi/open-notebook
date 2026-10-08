# NextNootbook: plan de backend

Estado: propuesta de implementación para el fork personal. El perfil sigue siendo local al navegador y pagos es una maqueta sin cobros. Este documento no anuncia autenticación multiusuario ni facturación ya implementadas.

## Producto y base existente

El producto se concentra en fuentes, notas, resúmenes, exámenes y chat. Se conserva FastAPI, SurrealDB y el worker de surreal-commands. Next.js consume la API existente mediante apiClient y TanStack Query. No hace falta introducir microservicios para empezar.

Hoy la contraseña protege una instalación completa; no identifica usuarios. Los registros y búsquedas no tienen aislamiento por cuenta. Los mensajes se guardan en checkpoints SQLite y los archivos en directorios locales. Estas tres fronteras deben resolverse antes de publicar un servicio con cuentas y pagos.

## Arquitectura propuesta

- **Identidad:** proveedor OIDC configurable, sesión de servidor con cookie HttpOnly, Secure y SameSite; validación de issuer, audience y expiración. CSRF en mutaciones con cookies. Mantener modo personal explícito para instalaciones locales; nunca convertir la contraseña de instalación en una identidad de cuenta.
- **Espacios:** User, Workspace y Membership con roles owner, editor y viewer. Cada usuario empieza con un espacio personal; compartir es una etapa posterior. El backend deriva la identidad de la sesión y valida el espacio solicitado contra la membresía.
- **Datos:** notebook, source, note, summary, exam, attempt, chat_session, attachment, visual_artifact y job pertenecen a un workspace. Las relaciones entre entidades requieren el mismo workspace. La metadata de cuenta no se guarda en localStorage.
- **Archivos:** interfaz de almacenamiento local/S3 compatible; claves con workspace y UUID, referencias en DB, descargas autorizadas o URLs firmadas de corta vida. Control de tamaño, MIME real, cuotas y eliminación diferida. Evitar rutas suministradas por el cliente.
- **Conversaciones:** abstracción del checkpointer con persistencia compartida antes de ejecutar varias réplicas. Validar pertenencia del thread antes de leer, continuar, exportar o borrar. Conservar imágenes y figuras en los históricos.
- **IA:** configuración y credenciales por espacio, cifradas; credenciales de plataforma solo accesibles al operador. Registrar consumo, límites y errores sin textos privados. Los jobs transportan workspace_id y actor_id y vuelven a validar el recurso.
- **Facturación:** adaptador de proveedor por decidir. Suscripciones, derechos de uso, eventos y facturas locales; checkout y portal alojados por el proveedor. No almacenar tarjetas. Los webhooks firmados son la fuente de estado, con deduplicación e idempotencia.

## Contratos previstos

Mantener /api y añadir contratos versionados cuando haya cambios incompatibles. DTOs Pydantic publicados en OpenAPI, cliente tipado y errores estables con code, message y request_id.

| Área | Contrato previsto | Control obligatorio |
|---|---|---|
| Cuenta | GET/PATCH /api/me; GET /api/me/sessions; DELETE /api/me/sessions/{id} | Sesión del titular; reautenticación para acciones sensibles |
| Espacios | GET/POST /api/workspaces; GET/PATCH /api/workspaces/{id} | Membresía y rol |
| Producto | Rutas actuales de notebooks/sources/notes/exams/chat | Filtrado obligatorio por workspace en lectura, escritura y búsqueda |
| Resúmenes | /api/summaries con source_ids, transformation_id y procedencia | Mismas fuentes autorizadas; migrar el marcador de notas conservando enlaces |
| Archivos | POST /api/attachments; GET/DELETE /api/attachments/{id} | Workspace, MIME, cuota y referencias activas |
| Pagos | GET /api/billing; POST /api/billing/checkout; POST /api/billing/portal | Owner; precio permitido definido en servidor |
| Eventos | POST /api/billing/webhooks/{provider} | Firma sobre cuerpo original; evento único; reconciliación |
| Operación | /api/admin/jobs, usage, audit y health | Rol de operador independiente; datos privados excluidos por defecto |

No aceptar owner_id, cuotas, precio, estado de pago ni permisos del navegador como autoridad. Los ids adivinables no sustituyen controles de acceso. La consulta de búsquedas vectoriales y textuales debe restringirse antes de devolver fragmentos al modelo.

## Etapas y criterios de aceptación

1. **Inventario y contrato:** mapear routers, consultas, ficheros y checkpoints; definir DTOs, amenazas y decisiones de proveedor. Aceptación: cada recurso y job tiene una política explícita de propiedad y retención.
2. **Identidad y aislamiento:** sesión, /me, workspace, repositorios con scope obligatorio y migraciones. Aceptación: tests con dos cuentas prueban que no pueden leer ni alterar notebooks, fuentes, notas, búsquedas, chats, imágenes, exámenes ni intentos ajenos, incluso mediante ids directos y jobs.
3. **Persistencia y archivos:** almacenamiento con cuotas, checkpointer compartido, importación del perfil local confirmada por el usuario. Aceptación: historial y figuras sobreviven reinicios y dos réplicas; borrado y restauración de backups comprobados.
4. **Operación:** panel administrativo de jobs y consumo, cancelación/reintento autorizado, auditoría, métricas y alertas. Aceptación: tareas atascadas visibles; logs sin claves ni contenidos; el operador no obtiene acceso habitual a material de estudio privado.
5. **Pagos:** elegir proveedor, monedas y precios; sandbox, webhook, derechos de uso y conciliación. Aceptación: eventos duplicados/fuera de orden, cancelación, impago y recuperación no duplican cobros ni conceden permisos indebidamente. Activar UI de pago únicamente después.
6. **Publicación:** entornos separados, dominio/TLS, CORS con orígenes concretos, secretos fuera del repo, límites de peticiones y presupuestos IA. Aceptación: migración ensayada y backup restaurado, rollback documentado, pruebas de carga y de aislamiento aprobadas.

Cada etapa requiere una rama personal con cambios revisables. No se modifica el PR inicial de upstream.

## Migración de la instalación actual

Crear un workspace de instalación y asignarle registros existentes sin borrarlos. Inventariar archivos y checkpoints; respaldar SurrealDB, uploads, figuras y SQLite como una unidad consistente. Aplicar migraciones aditivas con versionado existente, backfill verificable y reporte de huérfanos. No activar cuentas públicas mientras existan registros sin propietario. Mantener los IDs de recursos y enlaces; resolver resúmenes antiguos por el marcador actual. La reversión exige detener escrituras y restaurar el respaldo de todas las capas, no solo la base documental.

## Gestión y observabilidad

Separar liveness de readiness (DB, almacenamiento y cola); medir latencia API/IA, profundidad y antigüedad de jobs, errores de extracción, almacenamiento y gasto por espacio. Auditoría de cambios de rol, credenciales, facturación, exportación y borrado. Backups cifrados con retención definida y simulacros de recuperación. Rotación de secretos, restricciones de red y cuenta de DB con mínimo privilegio. La configuración global de modelos y credenciales queda en administración, no en el recorrido principal de estudio.

## Decisiones pendientes antes de cobros reales

Proveedor OIDC y facturación, región y jurisdicción del servicio, moneda e impuestos, política de datos/retención, límites de planes, uso de claves propias y presupuesto de IA. Diseñar adaptadores ahora; elegir servicios y activar cobros cuando estas decisiones estén acordadas.
