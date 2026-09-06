---
id: DEF-0001
date: 2026-09-06
found_in: revisión de la reorganización de configuración por módulo (decisión 0023)
prevented_by: gate
gate: scripts/architecture/check-env-completeness.ts
regression_test: scripts/architecture/check-env-completeness.test.ts
---

# DEF-0001 Cuatro variables obligatorias desaparecieron al migrar a configuración por módulo

## Qué pasó

La decisión 0023 sustituyó `requiredInProduction`, una lista plana de nueve variables, por reglas por módulo dentro del `superRefine` de cada `env.ts`. La reescritura solo pensó en términos de módulos: `API_KEY_PEPPER`, `SENTRY_DSN` y `TURNSTILE_SECRET` no pertenecen a ningún módulo de negocio, así que no aparecieron en `moduleEnvVariables` ni en ninguna regla nueva. Cayeron en el hueco entre "ya no está en la lista vieja" y "nadie escribió la regla nueva".

La consecuencia peor fue la de `API_KEY_PEPPER`: sin ella, `apps/web/src/main/container.ts` caía en `InMemoryApiKeyHasher`, un hash FNV-1a de 64 bits sin sal pensado para tests. Un despliegue en producción con base de datos real habría emitido y validado claves de API con normalidad, persistiéndolas hasheadas de una forma trivialmente reversible por fuerza bruta, sin ningún síntoma, ni siquiera un aviso de arranque.

`SENTRY_DSN` y `TURNSTILE_SECRET` ya habían sido obligatorias antes, cada una con su propio razonamiento escrito. La reorganización las revirtió en silencio.

## Por qué ninguna puerta existente lo vio

`bun run env-example` comprobaba que toda variable que un módulo *declara* estuviera documentada en `.env.example`. Eso es una comprobación contra lo que alguien recordó escribir, no contra lo que el esquema realmente exige. Una variable que dejó de estar gobernada por ninguna regla simplemente no aparecía en ese conjunto: no había nada que preguntara "¿esta exigencia de seguridad ha perdido su regla?", solo algo que preguntaba "¿lo que sí tiene regla está documentado?".

## Cómo se impide que vuelva

`scripts/architecture/check-env-completeness.ts` recorre el esquema zod de cada `env.ts`, recoge todo campo marcado `.optional()`, y falla si ese campo no está referenciado dentro del `superRefine` ni declarado explícitamente en `intentionallyOptionalEnvVariables`. Declarar una variable opcional nueva exige ahora una de las dos cosas en el mismo cambio, o el gate falla nombrando la variable exacta.
