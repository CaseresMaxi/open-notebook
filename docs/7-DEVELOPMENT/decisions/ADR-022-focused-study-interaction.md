# ADR-022: una actividad de estudio por pantalla

Estado: aceptado para el fork personal.

La petición del usuario prioriza estudiar y revisar su material, con la web de Instasent como referencia visual y de interacción. Se revisaron `site-header.tsx`, `site-header-shell.tsx` y el efecto reveal de `css-effects.module.css`: curvas suaves, revelado breve y detalles abiertos bajo demanda.

El cuaderno utiliza pestañas en todos los tamaños. Solo una actividad es visible y tiene una región principal de scroll. Chat se mantiene montado al alternar pestañas para conservar el borrador y la conversación. Las fuentes también alternan contenido/chat en todos los tamaños. Se usan pestañas semánticas y foco nativo; las transiciones de entrada son breves y se desactivan con movimiento reducido.

La interfaz habitual elimina IDs, tokens, caracteres, embeddings y columnas de fechas técnicas. La configuración del modelo se abre bajo demanda. Los controles de selección y limpieza de contexto siguen en su diálogo; adjuntos, figuras, exámenes interactivos y respuestas visuales explícitas se conservan. Los detalles de instalación se retiran de las pantallas de estudio y quedan en configuración avanzada. No se cambia el motor de IA ni se borra material.

Se reduce la intensidad del fondo y se conserva una superficie de lectura opaca. La identidad NextNootbook y el trabajo siguen exclusivamente en la rama personal del fork.
