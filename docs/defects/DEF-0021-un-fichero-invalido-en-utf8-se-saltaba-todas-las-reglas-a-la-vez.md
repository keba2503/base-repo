---
id: DEF-0021
date: 2026-09-09
found_in: revisión de seguridad de la rama que cerraba DEF-0016, antes de integrarla
prevented_by: gate
gate: scripts/architecture/check-source.ts
regression_test: scripts/architecture/check-source.test.ts
---

# DEF-0021 La puerta que separaba texto de binario abría una salida por la que se escapaban todas las demás reglas

## Qué pasó

Para cerrar DEF-0016, `scripts/architecture/check.ts` dejó de leer cada fichero como UTF-8 y pasó a leer bytes y decodificarlos con un `TextDecoder` estricto, de modo que un `.ico` se pudiera distinguir de un `.ts`. Lo que hacía con el resultado era:

```
const text = decodedText(bytes);
if (text === undefined) continue;
```

Es decir: lo que no decodifica no se comprueba. Y «no se comprueba» no significaba solo la regla nueva de bytes de control: significaba todas a la vez. Un fichero `.ts` con un byte suelto inválido en UTF-8 —un `0x80` perdido en cualquier sitio, incluso dentro de una cadena que el compilador acepta— pasaba `bun run arch` entero llevando dentro `any`, `process.env.SECRET` y una importación que rompe la regla de dependencias. La revisión lo comprobó ejecutándolo: el fichero pasaba la puerta y bun lo compilaba igual.

La puerta añadida para que un fichero no pudiera esconderse de las herramientas de texto había creado, en el mismo cambio, una forma nueva y más barata de esconderse de la puerta.

## Por qué ninguna puerta existente lo vio

Porque la introdujo este mismo cambio, y porque el `continue` parecía la traducción evidente de «esto es binario». Lo que faltaba era distinguir dos cosas que la decodificación no distingue: un fichero que *no es texto*, como `apps/web/src/app/favicon.ico`, y un fichero que *debería serlo* y no lo es. Para el primero saltar es correcto; para el segundo saltar es exactamente lo que hay que impedir, porque la extensión ya dice que alguna regla debía leerlo.

Ninguna prueba lo habría atrapado tampoco: las de `check-source.test.ts` entraban por `checkSource(file, text)`, que recibe texto ya decodificado, así que la decisión de saltar vivía en `check.ts`, fuera del alcance de cualquier caso.

## Cómo se impide que vuelva

La decisión se muda a `scripts/architecture/check-source.ts`, donde se puede probar, como `checkBytes(file, bytes)`, y deja de ser un `continue`:

- si los bytes decodifican, se aplican todas las reglas de siempre;
- si no decodifican y la extensión es una que alguna regla lee —`hasCheckedSyntax`: los guiones, el marcado, el JSON, el YAML y los ficheros de configuración con nombre propio—, la puerta emite `invalid-utf8` y falla;
- si no decodifican y no es ninguna de esas, es un dato y se salta.

`scripts/architecture/check.ts` queda reducido a leer bytes y llamar a `checkBytes`: ya no toma ninguna decisión propia sobre qué se comprueba.

`scripts/architecture/check-source.test.ts` fija el caso exacto que encontró la revisión —un `.ts` con `any`, `process.env` y un byte inválido, que ahora devuelve `invalid-utf8`—, el mismo fichero sin el byte inválido, que devuelve `no-any` y `env-only-in-main`, los tres tipos de fichero de configuración y marcado, y el icono, que sigue saltándose sin quejarse.
