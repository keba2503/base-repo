---
id: DEF-0002
date: 2026-09-06
found_in: revisión de seguridad de la skill component-source
prevented_by: gate
gate: scripts/agent/pre-bash.ts
regression_test: scripts/agent/deny-rules.test.ts
---

# DEF-0002 `bunx` no estaba en la lista de comandos bloqueados

## Qué pasó

`.claude/skills/component-source` indicaba al agente ejecutar `bunx shadcn@latest add ...` para traer un primitivo a `apps/web/src/ui`. `bunx shadcn@latest` resuelve y ejecuta un paquete que no aparece ni en `package.json` ni en `bun.lock`: sin versión fijada, sin entrada en el lockfile, sin registro de qué se ejecutó. Corre con los privilegios del propio agente antes de escribir un solo fichero. La skill ya exigía leer todo lo que el CLI producía, pero eso cubre la salida, no el runtime que la produjo.

La regla dura 4 de `AGENTS.md` existe justo para esto: bun siempre, nunca npm, pnpm, yarn o npx. La skill reabrió el mismo agujero bajo un nombre de comando distinto.

## Por qué ninguna puerta existente lo vio

`scripts/agent/pre-bash.ts` ya bloqueaba `npm`, `pnpm`, `yarn` y `npx` por nombre literal, pero nadie había añadido `bunx` a esa lista: la regla dura decía "bun solamente" en prosa, y el comprobador solo conocía los cuatro binarios de otros gestores de paquetes, no la superficie completa de "ejecutar un paquete fuera del lockfile" que `bunx` también abre.

## Cómo se impide que vuelva

`scripts/agent/pre-bash.ts` rechaza `bunx` salvo para `playwright`, y rechaza incluso ese caso si lleva una versión fijada (`@`), de modo que lo único ejecutable es el binario ya pinneado como devDependency. Ver decisión 0027.
