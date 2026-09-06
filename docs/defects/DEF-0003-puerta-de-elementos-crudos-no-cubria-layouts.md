---
id: DEF-0003
date: 2026-09-06
found_in: revisión de arquitectura al introducir apps/web/src/layouts
prevented_by: gate
gate: scripts/architecture/check-source.ts
regression_test: scripts/architecture/check-source.test.ts
---

# DEF-0003 La puerta de elementos crudos cubría `apps/web/src/app` pero no `apps/web/src/layouts`

## Qué pasó

`scripts/architecture/check-source.ts` prohibía un `<button>`, `<input>`, `<select>` o `<textarea>` crudo (fuera de `apps/web/src/ui`) solo dentro de `apps/web/src/app`. Cuando se introdujo `apps/web/src/layouts` para las plantillas compartidas, ese directorio quedó fuera del alcance de la regla: exactamente el sitio donde vivirán las plantillas que todas las páginas reutilizan, y por tanto donde un elemento crudo se replica más veces.

## Por qué ninguna puerta existente lo vio

La regla estaba escrita contra una ruta literal (`apps/web/src/app`), no contra el concepto que quería proteger ("cualquier código de interfaz fuera de `ui/`"). Un directorio nuevo bajo `apps/web/src` que no fuera `app` simplemente no entraba en el patrón, y nada comprobaba que el alcance de la regla creciera junto con el árbol de directorios que decía proteger.

## Cómo se impide que vuelva

`scripts/architecture/check-source.ts` amplió `rawElementDirectory` de `apps/web/src/app` a `apps/web/src`, cubriendo cualquier directorio presente o futuro bajo el árbol de la aplicación web salvo `apps/web/src/ui`. `scripts/architecture/check-source.test.ts` fija un caso en `apps/web/src/layouts` para que una regresión de alcance vuelva a fallar en rojo.
