---
id: DEF-0019
date: 2026-09-09
found_in: derivación del primer proyecto, al ejecutar bun run check por primera vez en el árbol nuevo
prevented_by: none
reason: dependency-cruiser ya lo señala en cada ejecución con severidad de aviso; subir no-orphans a error convertiría en fallo todo módulo escrito antes de tener quien lo importe, y eso es un cambio de política que necesita su propia decisión, no un efecto colateral de este registro
---

# DEF-0019 Un barril vacío dejaba un aviso permanente en `bun run depcruise`

## Qué pasó

`apps/web/src/layouts/index.ts` contenía una sola línea, `export {};`, y nadie lo importaba. `bun run depcruise` lo señalaba en cada ejecución con `warn no-orphans`, incluido el primer `bun run check` de un proyecto recién derivado.

El fichero existía por una razón real pero mal resuelta: `apps/web/src/layouts` está reservado para las plantillas compartidas entre vistas del mismo tipo, lo describen `ESTRUCTURA.md` y `docs/layers/web.md`, y la regla `reuse-ui-primitives` de `scripts/architecture/check-source.ts` lo cubre desde DEF-0003. Pero git no guarda directorios vacíos, así que hacía falta algún fichero dentro, y el elegido fue un barril. Un barril que no exporta nada declara una frontera de módulo que no existe: promete un punto de entrada por el que no pasa nada, y dependency-cruiser tenía razón al llamarlo huérfano.

El daño es el de cualquier aviso permanente: la primera salida que ve quien acaba de derivar un proyecto ya trae un aviso que no significa nada, y eso enseña a no leer las siguientes.

## Por qué ninguna puerta existente lo vio

La vio: `no-orphans` está en `.dependency-cruiser.mjs` desde el principio y lo decía en cada ejecución. Lo que no hizo fue impedir nada, porque su severidad es `warn` y `bun run check` solo se detiene ante los errores. El hueco no está en la detección sino en el tramo entre detectar y bloquear, y ese tramo es deliberado: un módulo escrito antes de que exista quien lo importe es una situación normal a mitad de un cambio, y convertirla en fallo cambiaría cómo se trabaja.

## Cómo se impide que vuelva

El barril desaparece y el directorio se mantiene con un `.gitkeep`, que es lo que el directorio necesitaba desde el principio: un marcador, no un módulo. `.gitkeep` no es TypeScript, así que dependency-cruiser no lo recorre y no puede quedar huérfano; el directorio sigue seguido por git, `ESTRUCTURA.md` sigue describiéndolo sin cambios y la regla `reuse-ui-primitives`, que se aplica por ruta a todo `apps/web/src` salvo `src/ui`, sigue cubriéndolo tal cual el día que aparezca la primera plantilla.

Queda sin puerta a propósito. Subir `no-orphans` a `error` cerraría esta clase entera, y puede que acabe siendo lo correcto, pero es una decisión sobre cómo se trabaja a mitad de un cambio y merece escribirse como tal en `docs/decisions/`, no colarse aquí como remedio de un barril de una línea.
