---
id: DEF-0005
date: 2026-09-06
found_in: bun run ui (scripts/ui/viewport.ts), primera ejecución de la puerta visual
prevented_by: gate
gate: scripts/ui/viewport.ts
---

# DEF-0005 El reset de `globals.css` vivía fuera de toda capa y ganaba en silencio a Tailwind

## Qué pasó

`apps/web/src/app/globals.css` tenía un `* { padding: 0 }` sin envolver en ningún `@layer`. Una regla sin capa gana siempre a cualquier capa nombrada, sin importar el orden de aparición en el fichero. Ese reset sin capa derrotaba en silencio a cualquier utilidad `px-*`, `py-*` o `m-*` de Tailwind en toda la aplicación: los botones medían 22 píxeles en vez de los tamaños que sus clases pedían.

## Por qué ninguna puerta existente lo vio

Nada en el resto de la puerta de arquitectura mira dentro de una hoja de estilos ni conoce el orden de cascada de CSS; eso no es un árbol de importaciones ni una regla de capas de Clean Architecture. El defecto solo era observable midiendo un elemento renderizado de verdad, que es justo lo que ninguna otra comprobación del repositorio hacía hasta que existió `bun run ui`.

## Cómo se impide que vuelva

Este es el caso donde la puerta ya existía antes que el defecto: `scripts/ui/viewport.ts` (la puerta visual añadida en el commit `7506340`) lo encontró en su primera ejecución real, sin que nadie rompiera nada a propósito, midiendo un tap target de 22px donde el mínimo exigido es 44px. La corrección (`ef600fe`) envolvió el reset en `@layer base`; ningún mecanismo nuevo hizo falta porque el mecanismo que debía atraparlo ya estaba escrito, solo no se había ejecutado todavía contra este árbol.
