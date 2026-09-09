---
id: DEF-0016
date: 2026-09-09
found_in: derivación del primer proyecto a partir de la plantilla, al renombrar el ámbito en todo el árbol
prevented_by: gate
gate: scripts/architecture/check-source.ts
regression_test: scripts/architecture/check-source.test.ts
---

# DEF-0016 Dos ficheros fuente llevaban un byte NUL crudo y por eso ninguna herramienta de texto los veía

## Qué pasó

`packages/infrastructure/src/memory/idempotency-store.ts` y `packages/infrastructure/src/memory/rate-limiter.ts` construían la clave compuesta de sus mapas con un separador NUL escrito como byte crudo dentro de una plantilla, no como escape. El separador está bien elegido: ningún ámbito, clave, cubo o sujeto que llegue de fuera puede contener un NUL, así que dos claves distintas no pueden colisionar en una sola cadena. Lo que estaba mal era la forma de escribirlo.

Un byte NUL en los primeros ocho mil de un fichero es exactamente la heurística con la que `file`, `grep -I` y `git grep` deciden que algo es binario. Los dos ficheros quedaban clasificados como datos: `grep -rl` no los listaba, `git grep` los saltaba, un `diff` los mostraba como «Binary files differ». Un renombrado de ámbito hecho sobre la salida de `grep` los dejaba atrás con el `@base/application` antiguo, y el error no aparecía al renombrar sino después, al compilar un proyecto que ya se creía derivado.

## Por qué ninguna puerta existente lo vio

`scripts/architecture/check-source.ts` mira la sintaxis del fichero: comentarios, `any`, `process.env`, importaciones entre anillos, elementos crudos. Todas esas reglas trabajan sobre el texto ya decodificado, y un NUL dentro de una plantilla es, para el analizador de TypeScript, un carácter más de una cadena perfectamente válida. Ninguna regla preguntaba por los bytes: por si el fichero, además de compilar, sigue siendo legible para las herramientas de texto con las que se trabaja sobre el repositorio.

Y la puerta no podía descubrirlo por accidente, porque `scripts/architecture/check.ts` leía cada fichero directamente como UTF-8 y le pasaba el texto al comprobador: la distinción entre texto y binario nunca llegaba a existir.

## Cómo se impide que vuelva

Los dos separadores se escriben ahora como `\u0000`, que produce exactamente la misma cadena en ejecución y deja los ficheros como texto.

`scripts/architecture/check-source.ts` añade la regla `no-control-bytes`, que se aplica a todos los ficheros y no solo a los que alguna otra regla reconoce: rechaza cualquier byte de control crudo entre `U+0000` y `U+001F`, salvo el tabulador, el salto de línea y el retorno de carro. El mensaje nombra el punto de código encontrado, para que quien lo lea sepa qué escape escribir.

Para que la puerta no herede la misma heurística que causó el defecto, no pregunta a `grep` qué es texto. `scripts/architecture/check.ts` lee los bytes y `checkBytes` los decodifica con un `TextDecoder` estricto: lo que es UTF-8 válido se comprueba entero; lo que no lo es y tiene una extensión que alguna regla lee se rechaza con `invalid-utf8`; y solo lo que no es ninguna de las dos cosas, como `apps/web/src/app/favicon.ico`, se salta. Un fichero con un NUL sigue siendo UTF-8 válido, así que cae del lado que se comprueba, que es justo lo que este defecto necesitaba.

La primera versión de este cambio saltaba todo lo que no decodificaba, y eso abría una salida por la que se escapaban todas las demás reglas a la vez. Lo encontró la revisión de seguridad antes de integrarlo y está registrado como DEF-0021.

`scripts/architecture/check-source.test.ts` fija el caso original, el separador escrito como escape, el tabulador y el retorno de carro que siguen permitidos, y las dos direcciones de la decodificación estricta.
