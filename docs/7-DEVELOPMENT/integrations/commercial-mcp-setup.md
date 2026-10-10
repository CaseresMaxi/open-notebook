# Conexiones de desarrollo para NextNootbook

Fecha: 2026-10-10. Configuración local de Codex, no integración runtime de la app. Las autorizaciones de desarrollo no se distribuyen al navegador ni sustituyen credenciales de servidor del producto.

## Firebase

MCP oficial configurado globalmente mediante:

```bash
codex mcp add firebase -- npx -y firebase-tools@15.33.0 mcp --dir /home/maxi/Escritorio/git/open-notebook --only auth,storage
```

El CLI 15.33.0 está autorizado con Google. Se creó un proyecto dedicado `nextnootbook-dev` y se verificó el MCP mediante inicialización, listado de 21 herramientas y lectura del proyecto. Completar el login de Google mediante:

```bash
npx -y firebase-tools@15.33.0 login
```

Seguir el enlace oficial y ejecutar el paso final en terminal; no guardar códigos temporales ni tokens en documentación. Después verificar cuentas y proyectos, identificar el proyecto dedicado al producto y confirmar su ID antes de modificar recursos. No tratar proyectos existentes de otros productos como destino por defecto.

El MCP usa las credenciales del CLI/ADC. Su autorización no equivale a tener Firebase Authentication configurado en Next.js/FastAPI. El runtime requiere configuración propia y autorización por workspace según el plan de backend.

[Documentación oficial](https://firebase.google.com/docs/ai-assistance/mcp-server).

## Proyecto de desarrollo creado

- Proyecto: `nextnootbook-dev`, nombre NextNootbook; número `400459113085`.
- Web app: `1:400459113085:web:b39a393092f8b0d8158714`.
- Email/contraseña y Google habilitados y despliegue de Authentication confirmado.
- `.firebaserc` vincula este repositorio al proyecto nuevo; `firebase.json` define emuladores y reglas de Storage.
- La configuración web descargada queda en `.firebase/web-config.json`, ignorada por Git. La configuración de provisión de Google con email de soporte queda en `firebase.auth.local.json`, también ignorada.
- Firebase incorpora automáticamente la URI de su auth handler; no añadirla nuevamente en la provisión, pues produce un error de URI duplicada.
- Storage cloud todavía no está creado. El despliegue de reglas informó que falta configurar Storage. Completar Blaze/facturación y elegir región antes de crear el bucket. Se propuso São Paulo para el escenario inicial de Argentina; confirmar mercado/región antes de producción.
- Las reglas `firebase/storage.rules` deniegan todo acceso de cliente. El backend deberá verificar identidad/workspace antes de usar IAM para objetos privados. Nunca publicar reglas abiertas para desbloquear el desarrollo.
- Los emuladores se enlazan solo a loopback: Authentication 9099, Storage 9199, UI 4000.
- Prueba real con emuladores aprobada: lectura/subida rechazadas para cliente anónimo y autenticado. Repetir con:

```bash
npx -y firebase-tools@15.33.0 emulators:exec --project demo-nextnootbook --only auth,storage 'python firebase/check-storage-rules.py'
```

La cuenta de prueba se crea exclusivamente en el emulador local; no se crean usuarios cloud.
- El registro/login de cuentas, recuperación de contraseña y sesiones de servidor ya están implementados como integración opcional en local. El modo Firebase obligatorio protege el almacén compartido para staging privado; el aislamiento multiusuario completo y la migración operativa todavía faltan antes de activar SaaS.
- Se provisionó una identidad de servidor dedicada con `roles/firebaseauth.admin`; su clave de desarrollo se conserva solo en `.firebase/`, con permisos privados y excluida de Git/Docker. Producción deberá usar una identidad de carga de trabajo.
- La instalación sigue leyendo/escribiendo sus datos localmente por decisión del propietario. Inventario, respaldo y herramienta de copia verificada: [migración de datos personales](personal-data-migration.md).

[Consola del proyecto](https://console.firebase.google.com/project/nextnootbook-dev/overview).

## Mercado Pago

Endpoint oficial: `https://mcp.mercadopago.com/mcp`.

El login OAuth iniciado por el cliente local fue rechazado con `OAuth authorization endpoint origin does not match the authorization server origin without issuer-bound callbacks`. No se deshabilitó esa validación. Se configuró la alternativa oficial de autenticación con bearer token:

```bash
codex mcp add mercadopago --url https://mcp.mercadopago.com/mcp --bearer-token-env-var MERCADOPAGO_ACCESS_TOKEN
```

Requiere que `MERCADOPAGO_ACCESS_TOKEN` esté disponible en el entorno del proceso de Codex. Configurar una credencial de pruebas localmente; no pegarla en chat, incluirla en argumentos ni commitearla. Si se modifica el entorno de la aplicación anfitriona, recargar la conexión para que tome la nueva variable. Algunas herramientas de gestión de aplicaciones solo están disponibles con OAuth; el token no garantiza equivalencia de capacidades.

Estado verificado: configuración registrada, sin sesión/token de cuenta verificado. No crear cobros reales para probar conectividad.

[Conexión oficial](https://www.mercadopago.com.ar/developers/en/docs/mcp-server/connection), [alternativa de token](https://www.mercadopago.com.ar/developers/en/docs/mcp-server/mcp-server-troubleshooting).

## Stripe

La integración oficial se encontró en el catálogo y se ofreció para conexión. Su instalación/autorización no está confirmada. Usar sandbox y confirmar país del negocio antes de seleccionar Stripe como proveedor inicial. No registrar una segunda conexión si se completa la integración disponible.

## Verificación posterior

1. Confirmar que las herramientas del MCP aparecen en la sesión; registrar una configuración no implica que esté cargada/autorizada en la conversación actual.
2. Firebase: verificar identidad y proyectos por lectura; elegir proyecto dedicado, luego revisar servicios.
3. Pagos: verificar entorno de pruebas y capacidades, sin imprimir credenciales.
4. Seguir las etapas del [plan de backend](../nextnootbook-backend-plan.md), empezando por identidad y aislamiento.
5. Solicitar acceso solamente cuando falte autorización concreta. Las implementaciones locales y pruebas con emuladores no dependen de una sesión cloud.
