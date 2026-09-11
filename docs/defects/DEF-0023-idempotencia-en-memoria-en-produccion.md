---
id: DEF-0023
date: 2026-09-11
found_in: revisión completa de layer-guardian y security-reviewer sobre todo el repositorio
prevented_by: none
reason: la deduplicación de eventos de proveedor sobre Postgres exige un esquema de tabla idempotency y una implementación real del puerto; ambos están pendientes y la decisión 0010 ya lo documenta, pero nada del árbol impide que alguien active billing en producción con solo persistencia en memoria
---

# DEF-0023 El IdempotencyStore y el RateLimiter solo existen en memoria, también en producción

## Qué pasó

La revisión completa del repositorio encontró que `apps/web/src/main/container.ts` instancia `InMemoryIdempotencyStore` y `SlidingWindowRateLimiter` sin importar la persistencia configurada: también en producción, también con `DATABASE_URL` establecido. La deduplicación de eventos de proveedor (`record-provider-payment-event.ts`) y la idempotencia de la API viven en la RAM del proceso: cada reinicio o despliegue borra el registro, y un webhook de pago duplicado puede aplicarse dos veces.

## Por qué ninguna puerta existente lo vio

Los gates comprueban forma, no runtime: la regla 8 exige interface, suite, memoria y real para cada puerto, y el `IdempotencyStore` cumple con su suite de contrato y su implementación en memoria, pero nada verifica que el composition root elija la real cuando hay base de datos. `assertBillingPersistenceIsSafeInProduction` cubre el repositorio de pagos, no los stores de idempotencia ni de rate limit. La decisión 0010 ya fija que el destino de ambos es Postgres, y el esquema no existe todavía, así que el hueco es un estado intermedio documentado, no una violación silenciosa.

## Qué lo impediría que vuelva

Ningún gate del árbol puede verlo: la elección vive en la composición, decidida en tiempo de ejecución. Cuando la migración del esquema de idempotencia llegue (la misma migración que traiga la tabla de rate limits), la corrección es una guardia del mismo calibre que `assertBillingPersistenceIsSafeInProduction`: en producción con base de datos, un `IdempotencyStore` en memoria se convierte en un error de arranque. Este registro es el marcador de que la pieza está pendiente hasta que esa puerta exista.