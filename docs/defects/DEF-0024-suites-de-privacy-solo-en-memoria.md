---
id: DEF-0024
date: 2026-09-11
found_in: revisión completa de layer-guardian y security-reviewer sobre todo el repositorio
prevented_by: none
reason: correr la suite de contrato de los sources de privacy contra Postgres exige un servicio real en el entorno de CI o DATABASE_URL configurado; los otros tres puertos de privacidad comparten esa misma limitación y el repo la asume para las suites contra proveedores reales
---

# DEF-0024 Las suites de contrato de los sources de privacy solo corren contra la memoria

## Qué pasó

La revisión encontró que los tres puertos de privacy (`AnonymizableSource`, `SubjectDataSource`, `RetainableSource`) violaban la regla 8: sin suite de contrato ni implementación real. La corrección trajo ambas implementaciones y la suite (`packages/infrastructure/test/contracts/privacy-sources.contract.ts`), pero la suite solo se ejecuta contra la memoria (`memory.test.ts`); `postgres.test.ts` aún no la corre contra `PostgresUserAnonymizableSource` y compañía.

## Por qué ninguna puerta existente lo vio

El gate de defectos (`bun run defects`) verifica que un defecto declare puerta, test o razón — no que una suite concreta corra contra ambos lados del contrato. Y el patrón del repositorio ya acepta esta frontera: las suites contra proveedores reales (Stripe, Resend, Postgres) se activan con variables de entorno y se saltan sin ellas, porque una puerta que falla en cada clon limpio deja de ser una puerta en la que nadie confía (`docs/workflow/quality-gates.md`, la misma razón de `bun run ui`).

## Qué lo impediría que vuelva

El paso que falta es mecánico y está marcado: registrar la suite de privacy en `postgres.test.ts` junto a las demás, dentro de la misma condición `DATABASE_URL` que ya usan las suites de Postgres. Hasta que ese paso llegue, la suite en memoria es la única evidencia, y este registro es el marcador de que el lado real del contrato no se ha ejercitado todavía.