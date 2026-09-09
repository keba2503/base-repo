---
id: DEF-0017
date: 2026-09-09
found_in: derivación del primer proyecto a partir de la plantilla, siguiendo el paso 2 de README.md
prevented_by: test
test: scripts/derive/derive.test.ts
---

# DEF-0017 La derivación a mano decía tres ficheros donde el ámbito vivía en doscientos setenta

## Qué pasó

`README.md` describía derivar un proyecto así: «reemplaza `@base` en `architecture/layers.json`, `tsconfig.json` y los campos `name` de los `package.json`». Ese es el inventario de los sitios donde el ámbito se *declara*, no de los sitios donde *aparece*. El ámbito aparece en cada importación de cada anillo, en `.github/workflows/ci.yml`, en la documentación de capas, en las reglas de `.claude/rules`, en las pruebas y en `bun.lock`: unos doscientos setenta ficheros seguidos.

Quien derivaba tenía dos salidas y las dos fallaban. Seguir la lista al pie de la letra dejaba un árbol que no compilaba, porque cada importación seguía apuntando a un paquete que ya no existía. Y hacerlo con un `sed` sobre la salida de `grep -rl` fallaba de dos maneras distintas a la vez: se saltaba los dos ficheros que DEF-0016 había vuelto binarios, y reescribía la propia frase del `README.md` que explicaba el renombrado, dejando unas instrucciones que hablaban de un ámbito que ya no estaba en ninguna parte.

Debajo del renombrado había además prosa que solo es verdad en la base y que ningún renombrado toca: `SECURITY.md` afirmaba «This is a base repository», `AGENTS.md` abría con «This repository is a base. Projects derive from it.», el `README.md` se presentaba como base y no como proyecto, y `docs/base.html` documenta la anatomía de la plantilla y viajaba entero a cada derivado.

## Por qué ninguna puerta existente lo vio

Porque la derivación no era código, era un párrafo. Las puertas de este repositorio comprueban el árbol contra sus propias reglas, y el árbol de la base es correcto: el defecto solo existe en el momento en que alguien copia ese árbol y lo convierte en otro, que es precisamente el momento en que ninguna de las puertas se está ejecutando todavía. Un procedimiento escrito en prosa no puede quedarse desactualizado en rojo; se queda desactualizado en silencio, y lo descubre quien lo sigue.

## Cómo se impide que vuelva

El procedimiento pasa a ser un programa: `scripts/derive/derive.ts`, expuesto como `bun run derive <scope> <repo-name>`. Lee el ámbito vigente de `architecture/layers.json` en vez de llevarlo escrito, renombra ese ámbito en todos los ficheros seguidos que decodifican como UTF-8 —sin preguntarle a `grep` qué es texto, que es la heurística que causó DEF-0016—, renombra el paquete raíz, borra `docs/base.html`, reescribe las secciones de `README.md`, `SECURITY.md` y `AGENTS.md` que solo son verdad en la base, y se niega a ejecutarse por segunda vez porque el ámbito declarado ya sería el pedido. Valida el ámbito y el nombre contra la gramática de npm antes de tocar nada, así que un argumento mal escrito no deja el árbol a medio renombrar.

`scripts/derive/derive.test.ts` copia el árbol seguido entero a un directorio temporal y lo deriva de verdad. La afirmación que sostiene este registro es la que no se puede escribir en prosa: después de derivar, ningún fichero copiado menciona ya el ámbito anterior. Si mañana aparece una capa nueva, un workflow nuevo o un directorio de reglas nuevo, esa prueba los cubre sin que nadie tenga que acordarse de añadirlos a una lista.

La herramienta se borra a sí misma al terminar, junto a `docs/base.html`, a su línea de `package.json` y a su línea de `ESTRUCTURA.md`: en un proyecto ya derivado no tiene nada que hacer, y su prueba, que espera encontrar la prosa de la base, fallaría en cada `bun run check` del proyecto nuevo. Ese fallo llegó a existir en esta misma rama y lo encontró la comprobación de extremo a extremo antes de integrarla.

Borrar la prueba abría un fallo detrás: este mismo registro la nombra en su `test:`, así que `bun run defects` del proyecto derivado se quejaba de una prueba que ya no existía. La herramienta no borra este fichero por su nombre, que sería una lista más que mantener: al terminar mira todos los registros de `docs/defects/` y se lleva los que nombran como `gate`, `test` o `regression_test` alguno de los ficheros que acaba de borrar. Un registro futuro que se apoye en una herramienta solo de la base queda cubierto sin que nadie se acuerde de añadirlo.

Lo que la herramienta no hace es escribir de forma transaccional: valida el ámbito, el nombre, la lista de ficheros y las cuatro secciones de prosa antes de tocar nada, así que un argumento mal escrito o un árbol que ha derivado ya no dejan nada a medias, pero un fallo de escritura a mitad del bucle final sí dejaría el árbol medio renombrado. No se envuelve en un directorio temporal a propósito: `derive` se ejecuta sobre un clon recién hecho y sin trabajo propio dentro, donde `git checkout -- .` deshace una ejecución parcial por completo, y eso es lo que dice el mensaje de error cuando falla.

No es una puerta, y por eso este registro dice `test` y no `gate`: nada en `bun run check` puede fallar porque alguien derive mal, ya que el error ocurre en un árbol que todavía no es este repositorio. Lo que la prueba fija es que la herramienta que sustituye al párrafo sigue cubriendo el árbol completo.
