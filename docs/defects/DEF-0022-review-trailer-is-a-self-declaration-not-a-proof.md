---
id: DEF-0022
date: 2026-09-06
found_in: revisión de seguridad del propio mecanismo de la regla 13
prevented_by: none
reason: el trailer Reviewed-by es texto libre en el mensaje de commit, escrito por la misma persona que escribió el código; no hay identificador verificable que lo ligue a una revisión real de layer-guardian y security-reviewer, y construir uno (registro firmado por sesión, resuelto contra un artefacto que los propios agentes escriban) es una infraestructura que este repositorio no tiene todavía y que no se justifica frente al coste, dado que hoy solo hay un operador humano capaz de auditar el historial. Cerrarlo con un gate de humo (comprobar que el texto existe) sería peor que decir la verdad.
---

# El trailer de revisión declara, no demuestra

La revisión de seguridad sobre el propio mecanismo de `commit-msg` (que exige `Reviewed-by:` o `Review-exempt:` en cada commit) encontró que declarar cualquiera de los dos trailers cuesta exactamente lo mismo: son texto libre, y quien escribe el commit puede escribir cualquiera de los dos sin que nada lo verifique. `Reviewed-by: layer-guardian, security-reviewer` no es prueba de que la revisión ocurrió, es una afirmación de que ocurrió.

## Por qué ninguna puerta existente lo vio

Porque no existía el mecanismo hasta este mismo cambio. Es el primer defecto que se encuentra sobre un cambio antes de que termine de fusionarse, en la misma ronda de revisión que lo crea.

## Lo que sí se cerró de la misma revisión

La misma ronda encontró que el hook de `commit-msg` es del lado del cliente: se salta con `--no-verify`, no corre si `lefthook install` no se ejecutó, y GitHub jamás lo re-ejecuta sobre el commit de fusión que de verdad llega a `main`. Eso sí tenía arreglo barato y se aplicó: un trabajo nuevo en `.github/workflows/ci.yml`, `review-trailer`, que corre en cada `push` a `main` y valida el trailer del commit que de verdad aterrizó, sin que nada del lado del cliente pueda evitarlo.

## Lo que queda así, a propósito

Que el trailer sea autodeclarado, no. La alternativa honesta no es fingir que se verificó: es decir que no se verificó, y por qué construirlo no compensa hoy. Si el repositorio pasa a tener más de un operador, o si el registro de revisiones empieza a usarse como prueba ante alguien externo, esta decisión se revisa.
