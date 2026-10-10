# ADR-024: Firebase, cuentas comerciales y consumo de IA

Fecha: 2026-10-10. Estado: propuesta para el fork personal, pendiente de implementación.

## Contexto

El usuario quiere NextNootbook como producto comercial: Firebase para cuentas, gestión de archivos, pagos intercambiables y control del uso de modelos por usuario. La instalación actual usa contraseña compartida, archivos locales y datos sin aislamiento de cuentas. Perfil y pagos son maquetas.

## Decisión propuesta

- Firebase Authentication identifica usuarios; sesión de servidor con cookie HttpOnly verificada por FastAPI. SurrealDB conserva datos de producto con workspace obligatorio; el trabajador y los checkpoints también validan propiedad.
- Archivos privados mediante una interfaz de almacenamiento con Firebase/GCS inicial y local para desarrollo. Incluir originales, figuras, adjuntos y respuestas de exámenes.
- El operador define modelos por tarea, plan y excepciones por usuario. Las credenciales son de plataforma y no aparecen en la interfaz del estudiante.
- Todas las funciones de estudio están disponibles por defecto; planes y presupuestos controlan capacidad. Reserva atómica y ledger cubren streams, herramientas, reintentos y tareas asíncronas.
- Dominio de facturación independiente con adaptadores Mercado Pago/Stripe. Elegir primer proveedor según país del negocio; guardar proveedor de cada suscripción, verificar webhooks y conciliar. Cambiar proveedor no migra automáticamente autorizaciones de cobro.
- Experiencia centrada en cargar materiales, comprender y practicar; administración separada y autorizada por servidor. El enlace de herramientas de desarrollo no es control de acceso.

## Consecuencias

Firebase no sustituye el aislamiento ni las cuotas de backend. El modo SaaS exige migrar propiedad, archivos y checkpoints antes de aceptar cuentas públicas. La instancia local y los datos existentes no se modifican por aprobar esta arquitectura. La beta medida determina precios/capacidad; no se promete IA ilimitada.

El [plan completo](../nextnootbook-backend-plan.md) define pantallas, contratos, etapas, migración y criterios de aceptación. Este documento no anuncia servicios ya integrados.
