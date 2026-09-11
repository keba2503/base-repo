---
id: DEF-0027
date: 2026-09-11
found_in: revisión de layer-guardian sobre el diff de la corrección de privacy
prevented_by: none
reason: cerrar este hueco exige que AnonymizableSource deje de devolver un booleano y devuelva un Result que distinga por qué no se anonimizó, y ese cambio toca el puerto, sus dos implementaciones y la suite de contrato; es una decisión de puerto, no un arreglo puntual
---

# DEF-0027 El executor de borrado descarta el resultado de cada fuente y un borrado parcial pasa por completado

## Qué pasó

`eraseSubjectDataExecutor` recorre sus fuentes con `await source.anonymize(...)` y descarta el booleano que cada una devuelve. Si una fuente no anonimiza nada — el sujeto no existe en ella, pertenece a otro tenant, o la invariante de anonimización falla — el job se marca completado igual. El puerto devuelve `Promise<boolean>`, que tampoco distingue el motivo, así que el executor no puede decidir entre "no había nada que borrar" (correcto) y "no pude borrar" (un fallo que debería reintentarse o al menos registrarse).

## Por qué ninguna puerta existente lo vio

Los gates comprueban forma y contrato, no política de agregación: la suite de contrato verifica que cada fuente anonimiza y que respeta el tenant, y ninguna de esas aserciones exige que el executor reaccione al resultado. El tipo `Promise<boolean>` es legal en el árbol y el descarte del valor de retorno no es un error de lint. Lo que falta es una decisión de política — qué significa que una fuente devuelva false, y si eso debe fallar el job — y esa decisión no está escrita en ningún sitio.

## Qué lo impediría que vuelva

El puerto debería devolver un `Result` con un código que separe "no encontrado" de "fallo", y el executor debería acumular los fallos y devolver un error cuando alguna fuente aplicable no pudo anonimizar, para que el job se reintente en lugar de darse por hecho. Ese cambio toca `AnonymizableSource`, `RetainableSource`, sus implementaciones en memoria y Postgres y la suite de contrato, así que queda como decisión pendiente con este registro como marcador.