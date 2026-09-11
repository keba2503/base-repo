---
id: DEF-0025
date: 2026-09-11
found_in: revisión completa de layer-guardian y security-reviewer sobre todo el repositorio
prevented_by: none
reason: el comportamiento se corrigió fallando cerrado, pero ningún gate del árbol puede impedir que una configuración de despliegue vuelva a montar la ruta sin secreto; la guardia de producción en env.ts es la única línea que lo impide hoy
---

# DEF-0025 El cron de dispatch aceptaba cualquier llamada cuando CRON_SECRET no estaba configurado fuera de producción

## Qué pasó

La revisión de seguridad encontró que `authorized()` en `apps/web/src/main/cron-dispatch.ts` devolvía true sin secreto configurado en cualquier entorno que no fuera producción: un despliegue de staging o desarrollo expuesto dejaba que cualquiera que encontrara la URL despachara el outbox y la cola de jobs con el actor system, creando y ejecutando trabajo a voluntad.

## Por qué ninguna puerta existente lo vio

El entorno de un despliegue no vive en el árbol: una guardia de env solo cubre el valor de `nodeEnv` con el que el proceso arranca, y staging por definición no es producción. La corrección falla cerrado en todos los entornos (sin secreto, toda llamada se rechaza y se avisa en el log), que es el comportamiento correcto; pero la configuración que provoca ese estado — desplegar sin `CRON_SECRET` en un entorno distinto de producción — no es observable por ningún script que lea el árbol, igual que la frontera que la decisión 0029 documenta para los disparadores programados.

## Qué lo impediría que vuelva

La corrección ya cambió la semántica: sin secreto la ruta falla cerrada en cualquier entorno, no solo en producción, y el aviso queda en el log en cada rechazo. La guardia de `env.ts` exige el secreto en producción y sigue siendo la única línea de defensa en los demás entornos; este registro deja escrito que el fallo cerrado es intencional y que un gate sobre la configuración del despliegue no es posible desde el árbol.