---
id: DEF-0029
date: 2026-09-11
found_in: segunda pasada de security-reviewer sobre el diff de la corrección de privacy
prevented_by: none
reason: deduplicar el barrido exige que el job queue sepa que ya hay un sweep pendiente para ese tenant, y el puerto JobQueue no expone una consulta por nombre; añadirla es una decisión de puerto con su suite, no un arreglo puntual
---

# DEF-0029 Cada arranque del worker encola un barrido de retención nuevo, sin deduplicar

## Qué pasó

`apps/worker/src/index.ts` llama a `schedulePrivacyRetentionSweep` en el arranque, y esa función encola un job `privacy.retention.sweep` sin comprobar si ya hay uno pendiente. Cada reinicio del worker — un despliegue, un crash con reinicio, un bucle de reinicios — añade un sweep más, y cada sweep re-encola el siguiente al terminar. Un worker que reinicia en bucle multiplica los barridos en lugar de mantener uno por intervalo.

## Por qué ninguna puerta existente lo vio

`JobQueue` no expone una consulta por nombre de job pendiente (`packages/application/src/kernel/ports/job-queue.ts` ofrece encolar, reclamar y marcar, no preguntar), así que el composition root no tiene forma de saber si ya sembró su sweep. Ningún gate del árbol puede ver una duplicación que solo aparece en el historial de arranques de un proceso: la puerta mira el código y el contrato de los puertos, no cuántas veces un worker ha arrancado.

## Qué lo impediría que vuelva

Un método en `JobQueue` que responda si hay un job pendiente con un nombre dado para un tenant, con su suite de contrato, y que la siembra lo consulte antes de encolar. Alternativamente, que el propio barrido sea idempotente por diseño — un `runAt` único por intervalo calculado en lugar de re-encolado ciego. Ambas son decisiones de puerto, así que quedan pendientes con este registro como marcador.