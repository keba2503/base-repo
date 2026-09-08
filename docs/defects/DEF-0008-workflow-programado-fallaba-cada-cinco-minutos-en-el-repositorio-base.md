---
id: DEF-0008
date: 2026-09-08
found_in: correo de GitHub Actions al propietario del repositorio, "Cron dispatch: All jobs have failed", repetido cada cinco minutos
prevented_by: gate
gate: scripts/architecture/check-workflows.ts
regression_test: scripts/architecture/check-workflows.test.ts
---

# DEF-0008 El disparador programado de despacho fallaba cada cinco minutos en el repositorio base, que no despliega nada

## Qué pasó

`.github/workflows/cron-dispatch.yml`, introducido por la decisión 0028, se programó cada cinco minutos y falla a propósito cuando faltan `CRON_DISPATCH_URL` o `CRON_SECRET`. En este repositorio no hay despliegue ni secretos, así que cada ejecución fallaba y GitHub enviaba el aviso de fallo al propietario: unos 288 correos idénticos al día, ninguno describiendo un problema real. El daño no es el ruido sino la inversión de la señal: el único canal que debía significar "la cola no se está drenando" pasó a significar "esto sigue siendo el repositorio base".

## Por qué ninguna puerta existente lo vio

Las puertas de este repositorio leen el árbol: el grafo de capas, la estructura de directorios, las variables de entorno declaradas, los registros de defectos. Ninguna de ellas mira el estado operativo de la cuenta de GitHub, que es donde vive la única diferencia entre "este workflow debe fallar porque falta un secreto" y "este workflow no debería estar programado en absoluto". La decisión 0028 razonó correctamente sobre el proyecto derivado que despliega y no sobre el repositorio base del que se deriva, y eso no es una comprobación que un script pueda hacer: es la distinción entre una plantilla y su instancia, que ningún fichero del árbol declaraba hasta ahora.

## Qué cambió

La decisión 0029 hace que el trabajo `dispatch` solo se ejecute cuando la variable de repositorio `CRON_DISPATCH_ENABLED` vale `true`, o cuando alguien lanza la ejecución a mano. En el repositorio base, donde nadie la ha puesto, cada ejecución programada queda como trabajo omitido: sin minutos de ejecución, sin fallo y sin correo. El fallo por secreto ausente sigue intacto en cuanto la variable está puesta, y la ejecución manual sigue ejecutando el trabajo siempre, para que la guarda nunca pueda esconder una configuración incompleta a quien la está buscando.

La revisión de seguridad de este mismo cambio señaló que la guarda abría un fallo silencioso nuevo: un proyecto derivado que configure los dos secretos y olvide la variable se queda sin nadie drenando la cola y sin ninguna ejecución roja que lo diga, que es justo lo que la decisión 0028 rechazó. El workflow lleva ahora un segundo trabajo, `configuration`, en su propia entrada diaria, que falla exactamente en ese estado: secretos presentes y variable distinta de `true`.

Ese trabajo diario no es la puerta: no se ejecuta en `bun run check` ni al integrar un cambio, solo en el reloj de un proyecto ya desplegado. La puerta es `scripts/architecture/check-workflows.ts`, añadida a `bun run check` como `bun run workflows`, y rechaza exactamente la forma que causó este defecto: un trabajo que lee un secreto dentro de un workflow con disparador `schedule:` y no lleva ninguna condición `if:` propia. Ejecutada contra la versión anterior de `.github/workflows/cron-dispatch.yml` falla y nombra el trabajo `dispatch`; contra la actual pasa.

La primera versión de este registro se quedó en `none`, razonando que ninguna puerta puede saber si detrás de un disparador programado hay un despliegue de verdad. Eso sigue siendo cierto y sigue siendo irrelevante: la puerta no necesita saberlo. Le basta con exigir que la decisión exista en el árbol, que es la misma forma que la regla 14 de `AGENTS.md` pide a un módulo de negocio — un disparador apagado no se monta, en vez de montarse y aprender a rendirse pronto. Lo que la puerta no puede comprobar es el estado inverso, un proyecto con los secretos puestos y la variable olvidada; para eso está el trabajo `configuration`, que vive en el reloj y no en el árbol.
