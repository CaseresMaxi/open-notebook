# NextNootbook: scroll y superficies

## Referencias inspeccionadas

Los labs de `instasent-web-nextjs` registran Grid Animator (Canvas 2D) y Halftone Field (WebGL) en `src/components/dev/effects-catalog.tsx`. Se revisaron `grid-animator.tsx` y `use-frame-effect.ts`: onda de celdas, resolución limitada, pausa fuera de pantalla y fotograma estático con movimiento reducido.

Aquí se adapta la onda de puntos a un canvas propio sin dependencias, sin glifos que compitan con el contenido y sin WebGL. Una sola capa decorativa, sin eventos de puntero, a 20 fps, DPR máximo 1.5 y cuadrícula más espaciada en móvil. El bucle se cancela al desmontar, al ocultar la pestaña o con movimiento reducido; tema y tamaño actualizan la trama. Lectura de mensajes opaca. Transparencia reducida y colores forzados ocultan la decoración.

## Propiedad del scroll

- Shell: altura dinámica de viewport; sin scroll del documento.
- Bibliotecas, perfil, pagos, configuración y exámenes: un scroll vertical de página con min-height: 0.
- Cuaderno: scroll propio de fuentes, mensajes y notas/resúmenes. Encabezados y compositor permanecen fuera del scroll de mensajes.
- Fuente: contenido y chat ocupan toda la altura disponible; el contenido hace scroll internamente una sola vez. En móvil hay pestañas, no dos paneles verticales comprimidos.
- Listado global de fuentes: tabla con scroll horizontal y vertical local, mantiene las columnas anchas.
- Diálogos: altura máxima ligada a dvh y scroll por defecto; los editores con disposición flex mantienen su scroll interno explícito.
- Chat: actualizaciones desplazan solo el viewport de mensajes; al alejarse más de 96px del final se conserva la lectura, y al volver al final se reanuda el seguimiento. Cambiar conversación reinicia el seguimiento.

## Superficies

Se elimina el marco del área principal. Las columnas del cuaderno se separan con líneas, sin tarjetas exteriores; fuentes y notas son filas separadas. Perfil y biblioteca dejan de encadenar paneles decorativos. Se conservan contornos con significado: campos, controles, tarjetas de exámenes interactivos y registros independientes de la biblioteca.

La petición explícita de animación/futurismo prevalece sobre la estética neutra de Arc. Se mantienen sus componentes, foco, estados y accesibilidad.
