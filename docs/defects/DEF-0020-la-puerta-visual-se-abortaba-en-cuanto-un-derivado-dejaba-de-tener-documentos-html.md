---
id: DEF-0020
date: 2026-09-09
found_in: primer proyecto derivado, al ejecutar bun run ui después de derivar
prevented_by: test
test: scripts/ui/check-viewport.test.ts
---

# DEF-0020 La puerta visual se abortaba en cuanto un derivado dejaba de tener documentos HTML

## Qué pasó

`scripts/ui/viewport.ts` mide las rutas estáticas de la web y, además, cada documento HTML seguido bajo `docs/`, a cuatro anchos. Antes de arrancar el navegador exigía las dos listas:

```
if (documents.length === 0) throw new Error("no document was found under docs");
```

El único HTML bajo `docs/` en este repositorio es `docs/base.html`, que documenta la anatomía de la plantilla y que `bun run derive` borra por ser exactamente eso: contenido de la base que no tiene por qué viajar al derivado. El resultado es que la primera ejecución de `bun run ui` en cualquier proyecto derivado moría antes de medir nada, y con ella se perdía también la comprobación de las rutas, que sí existían y sí podían medirse.

La exigencia venía de una suposición razonable en el sitio equivocado: en la base siempre hay un documento, así que su ausencia solo podía significar que alguien había roto la lista de ficheros seguidos. En un derivado significa lo contrario, que el proyecto no publica documentación HTML, y eso es una elección legítima que ningún proyecto está obligado a deshacer.

## Por qué ninguna puerta existente lo vio

`bun run ui` no forma parte de `bun run check` —arranca un servidor y un navegador de verdad— así que ninguna puerta lo ejecuta al integrar un cambio. Y aunque lo hiciera, en este repositorio pasa: `docs/base.html` existe. El defecto solo aparece en un árbol del que ya se ha borrado ese fichero, es decir, después de derivar, que es precisamente el árbol que este repositorio no ejecuta nunca.

Además, `documentsFrom` vivía dentro de `viewport.ts`, junto al arranque del servidor y del navegador, y no estaba exportada. `scripts/ui/check-viewport.ts` existe justamente para que las decisiones puras de esta puerta se puedan probar sin navegador, y esta decisión se había quedado fuera: no había forma de escribirle un caso.

## Cómo se impide que vuelva

La lista de documentos pasa a `scripts/ui/check-viewport.ts` como `documentsFromFiles`, exportada y probada, junto a `routesFromPageFiles`, que es su pareja natural. `scripts/ui/viewport.ts` deja de abortar cuando esa lista viene vacía: mide las rutas, se salta la pasada de documentos y dice cuántos documentos midió, que serán cero. La exigencia de que existan rutas se queda como estaba, porque una aplicación web sin ninguna ruta sí es un árbol roto.

Lo que no se suaviza es el fallo cuando los documentos existen: si hay un HTML bajo `docs/` y el navegador no puede cargarlo o el documento se desborda a 375px, la puerta sigue fallando igual que antes.

`scripts/ui/check-viewport.test.ts` fija los tres casos: los documentos que sí cuentan, los ficheros que no, y el árbol sin ningún HTML bajo `docs/`, que ahora devuelve una lista vacía en vez de tumbar la ejecución.
