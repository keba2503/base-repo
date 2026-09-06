---
id: DEF-0004
date: 2026-09-06
found_in: revisión de despliegue progresivo (rolling deploy) de jobs
prevented_by: test
test: packages/application/test/dispatch-jobs.test.ts
---

# DEF-0004 Un job sin ejecutor registrado se marcaba agotado al instante

## Qué pasó

`dispatchJobs` copiaba el atajo de `dispatch-outbox`: "ningún handler registrado significa que a nadie le importa". Eso es correcto para el outbox, pero no para un comando con un dueño previsto. En un despliegue progresivo, la mitad web puede encolar un job cuyo nombre la mitad worker, aún no redesplegada, no conoce todavía. Con el comportamiento anterior, ese job se marcaba `markExhausted` en el primer intento y se destruía en silencio, sin dejar nada una vez que el worker nuevo arrancaba.

## Por qué ninguna puerta existente lo vio

El comportamiento se validaba con una sola versión de los ejecutores en cada test: nunca se había simulado un despliegue en el que dos versiones del worker coexisten sobre la misma cola, que es exactamente la situación donde "sin ejecutor" significa "todavía no", no "nunca". Un job sin ejecutor y un job que falla de verdad compartían el mismo camino, así que la ausencia de handler nunca se distinguió de un fallo real de negocio.

## Cómo se impide que vuelva

Un job sin ejecutor ahora reintenta con el mismo backoff creciente que un job fallido, contando el intento, y solo se agota al llegar a su propio `maxAttempts`. `unhandled` es su propio cajón en `DispatchJobsResponse`. `packages/application/test/dispatch-jobs.test.ts` fija el caso simulando dos versiones del worker sobre la misma cola.
