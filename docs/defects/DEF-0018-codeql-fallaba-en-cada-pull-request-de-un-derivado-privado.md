---
id: DEF-0018
date: 2026-09-09
found_in: primer pull request del primer proyecto derivado, repositorio privado recién creado
prevented_by: none
reason: si un repositorio es privado y si su cuenta tiene GitHub Code Security vive en los ajustes de GitHub, no en el árbol; ningún script que lea este repositorio puede saberlo, y el estado se decide una vez al crear el derivado
---

# DEF-0018 CodeQL fallaba en cada pull request de un derivado privado, y la única salida cómoda era falsificar la puerta

## Qué pasó

`.github/workflows/codeql.yml` analiza el código y sube el resultado con `security-events: write`. En un repositorio público eso es gratis. En uno privado forma parte de GitHub Code Security, que se paga: sin él, el paso `github/codeql-action/analyze` falla al subir, y el primer proyecto derivado —privado y recién creado— tuvo un `codeql` en rojo en cada pull request desde el primero.

El daño no es el aspa. `README.md` recomienda exigir `check`, `secrets` y `codeql` como comprobaciones obligatorias en `main`: una comprobación que no puede ponerse verde bloquea todas las integraciones o, peor, enseña a quien la configuró a dejar de mirarla. Y la salida cómoda estaba a una línea: un `continue-on-error` en el paso de análisis pone el aspa en verde sin analizar nada, que es exactamente la puerta falsa que prohíbe la regla 6 de `AGENTS.md`.

## Por qué ninguna puerta existente lo vio

Es la misma frontera que encontró la decisión 0029 con el disparador programado, un anillo más afuera. Las puertas de este repositorio leen el árbol; si un repositorio es público o privado, y si la cuenta que lo aloja tiene Code Security contratado, no está en ningún fichero del árbol y no lo estará nunca. Además, el repositorio base es público, así que su propio CodeQL pasa: el defecto solo existe en la instancia, no en la plantilla, y la plantilla no puede observarlo.

## Cómo se impide que vuelva

Sin puerta, a propósito. La decisión 0031 deja el workflow exactamente como está y escribe los dos estados honestos en los que un derivado puede quedar: público o privado con Code Security, y entonces CodeQL corre y su resultado significa lo que dice; o privado sin él, y entonces el workflow se desactiva en **Actions** y `codeql` sale de las comprobaciones obligatorias de `main`. No se analiza nada y nada finge analizar.

Lo que sí cambia es dónde está escrito. La elección pasa a los pasos de derivación de `README.md`, que es el momento en el que hay que tomarla, en lugar de una sección de seguridad que nadie lee mientras crea un repositorio. Es lo más cerca de una puerta que este defecto admite: no impide equivocarse, pero pone la pregunta delante de quien todavía puede contestarla.
