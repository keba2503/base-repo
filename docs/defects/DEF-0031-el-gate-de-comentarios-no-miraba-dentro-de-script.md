---
id: DEF-0031
date: 2026-09-11
found_in: al versionar un diagrama HTML generado, la usuaria notó que el artefacto llevaba comentarios JS y el gate no los veía
prevented_by: test
test: scripts/architecture/check-source.test.ts
---

# DEF-0031 La regla de no comentarios no miraba dentro de los bloques script de un html

## Qué pasó

`check-source.ts` trataba `.html` como texto plano y solo buscaba el marcador de apertura de un comentario HTML. Los comentarios de JavaScript dentro de un bloque `<script>` — de línea y de bloque — pasaban sin ser vistos, así que un fichero HTML con 86 comentarios de línea y 70 de bloque se declaraba limpio. La regla dura 2 dice que no hay comentarios en ningún fichero, de ninguna sintaxis, y esa parte del árbol era la única donde no se aplicaba.

## Por qué ninguna puerta existente lo vio

La puerta sí existía y sí corría: simplemente miraba un patrón que no cubre el contenido de un `<script>`. Es el fallo más silencioso que puede tener un gate — está montado, pasa, y no comprueba lo que dice comprobar. Se descubrió por accidente, al versionar un artefacto generado que traía comentarios propios, no porque ninguna revisión lo buscara.

## Cómo se impide que vuelva

`scriptCommentIssues` extrae cada bloque `<script>` de un `.html` y le aplica el mismo scanner de TypeScript que ya se usa para los ficheros `.ts`, con el número de línea reajustado al fichero completo. Cuatro tests lo fijan: comentario de línea dentro de un script, comentario de bloque, una URL que no debe confundirse con un comentario, y un comentario HTML fuera de un script. El escáner reutiliza el mismo criterio que ya distinguía una división de una expresión regular, así que no abre una segunda forma de interpretar JavaScript.