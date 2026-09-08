---
id: DEF-0010
date: 2026-09-08
found_in: revisiones de security-reviewer y layer-guardian sobre la rama claude/frequent-emails-iq9xzz, antes de fusionarla
prevented_by: gate
gate: scripts/architecture/check-workflows.ts
regression_test: scripts/architecture/check-workflows.test.ts
---

# DEF-0010 La puerta que exigía una condición al disparador programado aceptaba condiciones que no condicionan nada

## Qué pasó

La primera versión de `scripts/architecture/check-workflows.ts` exigía que un trabajo programado que lee un secreto llevara un `if:` propio, y comprobaba justo eso: que la línea existiera. Tres formas de cumplirla sin cumplir nada pasaron la puerta y las encontraron las revisiones del mismo cambio:

- `if: always()`, o cualquier condición constante. La línea está, no decide nada, y el trabajo vuelve a fallar en cada tick de cada clon sin secretos, que es el defecto DEF-0008 entero.
- `if: github.event.schedule == '41 8 * * *'` cuando el workflow ya solo declara `41 7 * * *`. Editar un horario en `on.schedule` sin tocar la cadena copiada en el `if:` deja el trabajo apagado para siempre, en silencio; en el trabajo `dispatch` eso es exactamente la cola que nadie drena.
- Un secreto declarado en el `env:` de todo el workflow, por encima de `jobs:`, que cada trabajo hereda. El escáner solo miraba el cuerpo de cada trabajo, así que un trabajo programado sin condición y con un secreto heredado le resultaba invisible.

La puerta comprueba ahora las tres cosas: la condición tiene que nombrar una variable del repositorio o el evento que dispara la ejecución, toda cadena comparada con `github.event.schedule` tiene que estar entre los horarios que el workflow declara, y un secreto declarado por encima de `jobs:` cuenta como leído por cada trabajo.

## Por qué ninguna puerta existente lo vio

Porque la puerta era la recién escrita, y una puerta escrita a la vez que el arreglo que valida hereda las suposiciones de quien la escribió: medía la presencia de una línea porque esa línea era la forma que acababa de darle al arreglo, no porque fuera la propiedad que importa. La regla 13 de `AGENTS.md` existe para esto, y aquí funcionó: ninguno de los tres huecos lo encontró quien escribió el código.

Lo que la puerta sigue sin comprobar es el estado inverso, un repositorio con un secreto puesto y la variable olvidada, porque eso no vive en el árbol; de eso responde el trabajo `configuration` del propio workflow, que también fallaba solo cuando estaban los dos secretos y ahora falla con cualquiera de ellos.
