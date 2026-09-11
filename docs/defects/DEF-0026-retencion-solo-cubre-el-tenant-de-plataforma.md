---
id: DEF-0026
date: 2026-09-11
found_in: revisión de layer-guardian y security-reviewer sobre el diff de la corrección de privacy
prevented_by: none
reason: el barrido de retención solo alcanza al tenant que encola el job, y enumerar los tenants reales exige un método de listado en TenantRepository que hoy no existe; sin él ningún barrido puede cubrir a todos, y añadirlo es una decisión de puerto con su propia suite de contrato
---

# DEF-0026 El barrido de retención solo cubre el tenant de plataforma, no los tenants reales

## Qué pasó

`retentionSweepExecutor` anonimiza `findSubjectsOlderThan(job.tenantId, ...)` y se re-encola con el mismo `job.tenantId`. El composition root del worker siembra el primer job con el tenant de plataforma (`apps/worker/src/main/retention-sweep-seed.ts`), así que el barrido recorre únicamente ese tenant: los datos personales de los tenants reales nunca expiran y la regla de retención de `docs/standards/data-and-gdpr.md` no se cumple para ellos.

## Por qué ninguna puerta existente lo vio

El defecto no es de forma sino de alcance: `TenantRepository` (`packages/application/src/tenants/ports/tenant-repository.ts`) expone `findBySlug`, `findById` y `save`, pero no un listado de tenants. Sin ese método, un barrido por tenant no puede descubrir a quién barrer, y el composition root solo conoce el tenant de plataforma que él mismo usa como actor de sistema. Ningún gate del árbol puede ver una cobertura de datos incompleta: la puerta de defects exige declarar cómo se impide que vuelva, no medir cuántos tenants alcanza un job.

## Qué lo impediría que vuelva

Dos pasos, ambos de diseño y por eso pendientes de decisión: añadir a `TenantRepository` un método de listado con su suite de contrato, y hacer que el barrido itere sobre él en lugar de sobre un único `job.tenantId` (o encolar un job por tenant, que es la forma que ya usan las operaciones tenant-scoped del repositorio). Hasta entonces este registro deja escrito que la retención es parcial por construcción y no por olvido.