---
id: DEF-0009
date: 2026-09-08
found_in: gancho de pre-push al empujar la rama claude/frequent-emails-iq9xzz, con bun run check en rojo antes de tocar nada
prevented_by: gate
gate: .github/workflows/ci.yml
regression_test: apps/web/test/api/request-id.test.ts
---

# DEF-0009 El alias `@/` de `apps/web` no tenía `baseUrl`, así que diez pruebas no resolvían sus importaciones al ejecutar `bun run check` desde la raíz

## Qué pasó

`apps/web/tsconfig.json` declaraba `paths: { "@/*": ["./src/*"] }` sin `baseUrl`. TypeScript resuelve esa ruta relativa al fichero de configuración, pero bun la resuelve relativa al directorio desde el que se le invoca. Ejecutado dentro de `apps/web`, todo pasaba; ejecutado desde la raíz del repositorio, que es como lo ejecutan `bun run check` y la integración continua, `./src/*` apuntaba a un `src` de la raíz que no existe y diez pruebas de `apps/web/test` morían con `Cannot find module '@/api'` antes de ejecutar su primera aserción. Añadir `"baseUrl": "."` a `apps/web/tsconfig.json` ancla la ruta a su propio directorio, que es lo que ya significaba en TypeScript, y las 929 pruebas del repositorio pasan desde la raíz.

## Por qué ninguna puerta existente lo vio

La puerta sí lo veía: `bun run check` fallaba, y con él el trabajo `check` de `.github/workflows/ci.yml`, que lo ejecuta desde la raíz en cada pull request y en cada push a `main`. Lo que faltaba no era una comprobación, sino que alguien mirara su resultado: el fallo no rompe ninguna prueba, las hace desaparecer, y una suite que no llega a ejecutarse se lee casi igual que una que pasa si solo se mira el resumen. Es el mismo hueco que DEF-0007, un piso más arriba: allí una suite existía y nada la ejecutaba; aquí se ejecutaban desde el directorio equivocado y el error de resolución se contaba como un fallo más entre los muchos de un `check` en rojo.

No lleva puerta nueva a propósito. Cualquier script que comprobara que todo `tsconfig.json` con `paths` declara `baseUrl` mediría la forma del fichero, no el síntoma; el síntoma ya tiene quien lo mida, y lo que hace falta es que `bun run check` esté verde antes de dar por cerrado un trabajo, que es lo que `AGENTS.md` ya exige y lo que este defecto demuestra que no siempre se cumplió.
