# ADR-021: NextNootbook, material y backend

Estado: aceptado para identidad y diseño; backend propuesto por etapas.

## Decisión

El fork personal se presenta como NextNootbook. Se mantiene la atribución y licencia de Open Notebook y los identificadores internos para no romper integraciones. Arc gratuito continúa aportando controles. La petición explícita de diseño futurista prevalece sobre la estética neutral del skill Arc.

Se revisaron `instasent-message-previews/src/ios/glass.tsx` y `instasent-web-nextjs/src/app/globals.css`, `hero-backdrop.tsx` y `site-header-shell.tsx` en los repos locales del usuario. Sus ideas de película, borde luminoso, cara sólida, tipografía compacta e índigo guían una implementación propia. No se copian activos corporativos ni se importa el kit de previews.

El cristal CSS se limita al chrome de navegación, con lectura opaca y alternativa por preferencias de transparencia/contraste. No se incorpora aún quick-liquid: la refracción óptica de ese motor es distinta del desenfoque CSS y requiere una evaluación propia de GPU/rendimiento en esta app. No se afirma paridad con el cristal iOS calibrado del repo de referencia.

El backend conserva FastAPI/SurrealDB/worker. El [plan](../nextnootbook-backend-plan.md) establece identidad, aislamiento, archivos, checkpoints compartidos, operación y pagos antes de ofrecer un SaaS. No se habilitan cobros con una maqueta.
