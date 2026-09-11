---
id: DEF-0030
date: 2026-09-11
found_in: segunda pasada de layer-guardian y security-reviewer sobre el diff de la corrección de privacy
prevented_by: none
reason: cerrar este hueco del todo exige que el worker lea el mismo almacén que web cuando ambos corren sin base de datos, y en memoria son dos procesos distintos sin almacén compartido; la solución real es la persistencia, que ya está decidida y no provisionada
---

# DEF-0030 Con persistencia en memoria, web y worker no comparten el almacén de usuarios

## Qué pasó

El composition root de web construye ahora las tres fuentes de privacidad sobre el mismo `InMemoryUserStore` que su repositorio de identidad, así que en desarrollo y en test — sin `DATABASE_URL` — un borrado o una exportación encuentran al sujeto que la API creó. El worker, en cambio, no monta repositorio de identidad: construye su propio `InMemoryUserStore` para las fuentes de privacidad, y ese almacén nace vacío y nunca recibe un usuario. Con el worker despachando los jobs de borrado y exportación, en memoria no encuentra a nadie y el job termina en `ok`.

## Por qué ninguna puerta existente lo vio

Es una frontera de proceso, no de código: dos procesos con memoria propia no comparten nada, y ningún gate del árbol puede verlo porque cada composition root es correcto por separado. La revisión lo detectó al comparar los dos, que es exactamente lo que un gate no hace. La guardia que sí existe para pagos (`assertBillingPersistenceIsSafeInProduction`) cubre una configuración insegura en producción, no la coherencia entre dos procesos en desarrollo.

## Qué lo impediría que vuelva

La pieza que lo cierra es la persistencia real: con `DATABASE_URL` configurado, web y worker comparten Postgres y el problema desaparece por construcción. Mientras no esté provisionada, la mitigación es una guardia de arranque en el worker equivalente a la de billing: con el módulo privacy activo y sin base de datos, avisar de que sus jobs no encontrarán sujetos. Ese aviso es el paso pendiente, y este registro es su marcador.