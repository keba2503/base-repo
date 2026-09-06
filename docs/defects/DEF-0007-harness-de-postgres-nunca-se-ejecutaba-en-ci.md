---
id: DEF-0007
date: 2026-09-06
found_in: fusión de la rama sane/isolation en main (conflicto en packages/infrastructure/test/postgres.test.ts)
prevented_by: gate
gate: .github/workflows/ci.yml
---

# DEF-0007 El harness de pruebas de Postgres quedó imposible de ejecutar al juntar dos ramas, y hasta entonces el aislamiento por fila nunca se había ejercido de verdad

## Qué pasó

Al fusionar `sane/isolation` en `main` hubo conflicto en `packages/infrastructure/test/postgres.test.ts`. Resolver ese conflicto a mano fue el primer momento en el que alguien realmente intentó ejecutar la suite de contrato contra una Postgres real desde que existía: hasta entonces, la seguridad a nivel de fila (decisión 0007) descansaba en código escrito y revisado, pero nunca ejercido por una ejecución real de esa suite.

## Por qué ninguna puerta existente lo vio

`docs/workflow/quality-gates.md` ya asumía explícitamente que no todo lo que importa corre en cada commit: las suites de contrato contra proveedores reales, incluida esta, solo corrían cuando alguien las lanzaba a mano, y el flujo de CI de este repositorio no tenía ningún trabajo que levantara una Postgres y ejecutara `packages/infrastructure/test/postgres.test.ts`. No es que una puerta mirara mal: es que ninguna puerta miraba ahí en absoluto, y nada en el repositorio distinguía "esta suite pasaría si se ejecutara" de "esta suite lleva meses sin ejecutarse".

## Qué cambió: de no medible a medible

La primera versión de este registro dejaba este defecto en `none`, con el razonamiento de que un trabajo de CI con Postgres real era una decisión de infraestructura que no correspondía tomar dentro de ese encargo. Esa decisión se tomó después, precisamente porque este es el más grave de los siete defectos del lote: la seguridad a nivel de fila es la segunda barrera del aislamiento entre clientes en este repositorio, y una barrera que solo se comprueba cuando alguien se acuerda de levantar una base de datos a mano no es una barrera comprobada.

Se añadió el trabajo `postgres` a `.github/workflows/ci.yml`, como trabajo propio, con su propio arranque, siguiendo el mismo patrón que ya usaba el trabajo `ui` para la puerta visual (una preparación que no corre en cada guardado local, pero sí en cada pull request y cada push a `main`, y que hace fallar la integración continua si falla, sin `continue-on-error`):

- Un contenedor de servicio `postgres:16` con comprobación de disponibilidad (`pg_isready`) antes de que arranque cualquier paso.
- Las dos conexiones que documenta `docs/layers/infrastructure.md`: `DATABASE_ADMIN_URL` apunta al superusuario del contenedor y solo migra el esquema; `DATABASE_URL` apunta a `app_user`, el rol sin `BYPASSRLS` que las migraciones crean, y es el que de verdad conecta como los repositorios bajo prueba, ejerciendo la política de seguridad a nivel de fila y no solo su definición.
- `bun run --filter @base/infrastructure db:migrate` aplica las migraciones (crea `app_user`, las tablas, las políticas) usando la conexión de administración.
- Como la migración crea `app_user` sin contraseña (en producción esa contraseña la gestiona el pooler de Supabase, fuera de este repositorio), el trabajo le asigna una contraseña propia de la ejecución con `ALTER ROLE ... WITH PASSWORD` antes de que la suite intente conectarse con ella.
- `bun test packages/infrastructure/test/postgres.test.ts --conditions react-server` ejecuta la suite de verdad, sin omitirla: al estar `DATABASE_URL` y `DATABASE_ADMIN_URL` presentes, deja de tomar la rama de "faltan variables, se omite" que tomaba en cualquier otro entorno sin Postgres.

El fichero de test no cambió: seguía siendo correcto, solo nunca se ejecutaba contra una base de datos real en un entorno que todo el mundo comparte. Lo que cambió es que ahora existe un lugar donde se ejecuta siempre, no solo cuando alguien se acuerda.
