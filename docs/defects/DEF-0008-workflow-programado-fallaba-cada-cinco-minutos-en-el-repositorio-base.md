---
id: DEF-0008
date: 2026-09-08
found_in: correo de GitHub Actions al propietario del repositorio, "Cron dispatch: All jobs have failed", repetido cada cinco minutos
prevented_by: none
reason: ninguna puerta de este repositorio puede saber si detrás de un disparador programado hay un despliegue con sus secretos configurados; eso vive en los ajustes de GitHub y de Vercel, fuera del árbol que las puertas leen
---

# DEF-0008 El disparador programado de despacho fallaba cada cinco minutos en el repositorio base, que no despliega nada

## Qué pasó

`.github/workflows/cron-dispatch.yml`, introducido por la decisión 0028, se programó cada cinco minutos y falla a propósito cuando faltan `CRON_DISPATCH_URL` o `CRON_SECRET`. En este repositorio no hay despliegue ni secretos, así que cada ejecución fallaba y GitHub enviaba el aviso de fallo al propietario: unos 288 correos idénticos al día, ninguno describiendo un problema real. El daño no es el ruido sino la inversión de la señal: el único canal que debía significar "la cola no se está drenando" pasó a significar "esto sigue siendo el repositorio base".

## Por qué ninguna puerta existente lo vio

Las puertas de este repositorio leen el árbol: el grafo de capas, la estructura de directorios, las variables de entorno declaradas, los registros de defectos. Ninguna de ellas mira el estado operativo de la cuenta de GitHub, que es donde vive la única diferencia entre "este workflow debe fallar porque falta un secreto" y "este workflow no debería estar programado en absoluto". La decisión 0028 razonó correctamente sobre el proyecto derivado que despliega y no sobre el repositorio base del que se deriva, y eso no es una comprobación que un script pueda hacer: es la distinción entre una plantilla y su instancia, que ningún fichero del árbol declaraba hasta ahora.

## Qué cambió

La decisión 0029 hace que el trabajo `dispatch` solo se ejecute cuando la variable de repositorio `CRON_DISPATCH_ENABLED` vale `true`, o cuando alguien lanza la ejecución a mano. En el repositorio base, donde nadie la ha puesto, cada ejecución programada queda como trabajo omitido: sin minutos de ejecución, sin fallo y sin correo. El fallo por secreto ausente sigue intacto en cuanto la variable está puesta, y la ejecución manual sigue ejecutando el trabajo siempre, para que la guarda nunca pueda esconder una configuración incompleta a quien la está buscando.

La revisión de seguridad de este mismo cambio señaló que la guarda abría un fallo silencioso nuevo: un proyecto derivado que configure los dos secretos y olvide la variable se queda sin nadie drenando la cola y sin ninguna ejecución roja que lo diga, que es justo lo que la decisión 0028 rechazó. El workflow lleva ahora un segundo trabajo, `configuration`, en su propia entrada diaria, que falla exactamente en ese estado: secretos presentes y variable distinta de `true`.

El registro sigue en `none` a propósito, y esa comprobación diaria no lo cambia, porque no es una puerta de este repositorio: no se ejecuta en `bun run check` ni en la integración continua de un cambio, solo en el reloj de un proyecto ya desplegado, y no puede distinguir un repositorio base de uno que piensa desplegar y todavía no ha configurado nada, que es el estado en el que empezó este defecto. Lo más parecido a una puerta de verdad sería un script que exigiera una guarda a todo workflow con `schedule:`, y mediría la forma del YAML sin saber nada de lo que de verdad falta: la relación entre un disparador y el despliegue que tiene detrás.
