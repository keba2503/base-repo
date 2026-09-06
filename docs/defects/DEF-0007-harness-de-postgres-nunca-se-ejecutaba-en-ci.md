---
id: DEF-0007
date: 2026-09-06
found_in: fusión de la rama sane/isolation en main (conflicto en packages/infrastructure/test/postgres.test.ts)
prevented_by: none
reason: la suite exige una Postgres real que ningún job de CI levanta hoy, y comprobar "alguien ejecutó este fichero recientemente" no es algo que este repositorio pueda verificar sobre sí mismo
---

# DEF-0007 El harness de pruebas de Postgres quedó imposible de ejecutar al juntar dos ramas, y hasta entonces el aislamiento por fila nunca se había ejercido de verdad

## Qué pasó

Al fusionar `sane/isolation` en `main` hubo conflicto en `packages/infrastructure/test/postgres.test.ts`. Resolver ese conflicto a mano fue el primer momento en el que alguien realmente intentó ejecutar la suite de contrato contra una Postgres real desde que existía: hasta entonces, la seguridad a nivel de fila (decisión 0007) descansaba en código escrito y revisado, pero nunca ejercido por una ejecución real de esa suite.

## Por qué ninguna puerta existente lo vio

`docs/workflow/quality-gates.md` ya asume explícitamente que no todo lo que importa corre en cada commit: las suites de contrato contra proveedores reales, incluida esta, solo corren en CI, y el `workflow` de CI de este repositorio no tiene ningún job que levante una Postgres y ejecute `packages/infrastructure/test/postgres.test.ts`. No es que una puerta mirara mal: es que ninguna puerta mira ahí en absoluto, y nada en el repositorio puede distinguir "esta suite pasaría si se ejecutara" de "esta suite lleva meses sin ejecutarse".

## Por qué queda sin mecanismo

Un gate no puede comprobar contra su propio repositorio si un fichero de test se ejecutó recientemente en algún entorno externo; eso vive en el historial de CI, no en el árbol de código. Añadir un job de CI con una Postgres real es una mejora real y deseable, pero es una decisión de infraestructura de CI, no algo que este registro de defectos pueda fingir resolver con una afirmación comprobable hoy. Queda escrito aquí como riesgo conocido y candidato explícito a una decisión futura (un job de CI con un servicio Postgres, análogo al de `ui`), no como un mecanismo ya cerrado.
