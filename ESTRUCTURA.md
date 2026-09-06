# Estructura del repositorio

Mapa en español de qué es cada pieza y qué papel juega en la máquina. Para las reglas completas de cada capa, `docs/`. Para trabajar con agentes, `AGENTS.md`. Para montar y desplegar, `README.md`.

Este documento no es decorativo: `bun run structure` falla si existe un directorio que no está aquí, o si aquí figura uno que ya no existe. Quien añade un directorio lo describe en el mismo cambio.

## La regla que lo ordena todo

Las dependencias del código fuente apuntan siempre hacia dentro, nunca hacia fuera. El anillo 1 no sabe que existe el 4. Cambiar Postgres por otra base de datos, o Next.js por otro framework, no debería tocar ni una línea de las reglas de negocio.

```
        anillo 1        anillo 2         anillo 3            anillo 4
        domain    <--   application  <--  contracts    <--   infrastructure
                                          adapters           apps/web
                                                             apps/worker
```

El grafo de quién puede importar a quién vive en un único fichero, `architecture/layers.json`. Nadie lo repite en prosa: el comprobador de arquitectura, dependency-cruiser y ESLint lo leen de ahí. Si una regla está mal, se cambia ese fichero y se escribe una decisión en `docs/decisions/`, nunca se debilita la puerta para que algo pase.

## Los anillos, en una frase cada uno

| Anillo | Paquete | Qué decide |
| --- | --- | --- |
| 1 | `packages/domain` | Las reglas de negocio. No importa nada, ni siquiera una librería |
| 2 | `packages/application` | Qué operaciones existen, quién puede hacerlas y en qué orden |
| 3 | `packages/contracts` | Qué entra y qué sale por la API, y con qué exigencias |
| 3 | `packages/adapters` | Cómo se traduce entre el mundo y los casos de uso, sin efectos |
| 4 | `packages/infrastructure` | Cómo se habla de verdad con Postgres, Supabase, Resend, Turnstile |
| 4 | `apps/web` | Cómo se entrega por HTTP y por pantalla |
| 4 | `apps/worker` | Cómo se procesa fuera de la petición |

## Los módulos, explicados

La aplicación está dividida por módulos de negocio. Cada módulo es una carpeta con el mismo nombre que se repite en cada capa: lo que decide, lo que orquesta, lo que valida y lo que habla con el exterior. Si vas a trabajar en documentos, todo lo de documentos está en carpetas llamadas `documents`.

Esto es lo que hace cada uno.

## Módulos núcleo y módulos opcionales

No todos los módulos pesan igual. `tenants`, `identity` y `audit` son **núcleo**: no se pueden desactivar porque casos de uso centrales dependen de ellos en firme, no a través de un mecanismo que tolera su ausencia. Crear un tenant escribe una entrada de auditoría en la misma transacción, no se la envía a un manejador que puede faltar; revocar una clave de API hace lo mismo. Si `audit` faltara, esas dos operaciones no podrían compilar ni ejecutarse. `tenants` e `identity` son la base sobre la que todo lo demás se apoya: casi cualquier caso de uso necesita un tenant y un actor resuelto.

`jobs`, `documents`, `notifications` y `privacy` son **opcionales**. Se activan o desactivan en `architecture/modules.json`, el mismo tipo de fichero que `architecture/layers.json`: una única fuente de verdad, sin condicionales repartidos por el código. Cada módulo declara `core`, `active` y `dependsOn`. Las raíces de composición (`apps/web/src/main` y `apps/worker/src/main`) leen ese fichero a través de `architecture/modules.ts` y montan casos de uso, rutas HTTP, ejecutores de trabajos y manejadores de eventos solo si el módulo está activo. Si no se monta, su código nunca corre, así que no hace falta preguntar `isEnabled()` en ningún sitio: la pregunta ya la resolvió quién construyó el grafo de objetos.

La dependencia entre módulos opcionales es real, no decorativa: `documents` depende de `jobs` porque confirmar una subida encola un trabajo de procesado sin mecanismo de resguardo; `privacy` depende de `jobs` y de `documents` porque exportar los datos de una persona escribe el resultado en el mismo almacén de ficheros que usa `documents`. Activar un módulo cuya dependencia está inactiva es un error que se detecta al arrancar (`assertModuleGraphIsValid`), no un fallo a medio camino de una petición. `notifications` no tiene esa clase de dependencia: si está inactivo, un evento como `tenant.created` se queda sin manejador y el despachador del outbox ya lo trataba como un caso normal, marcándolo publicado sin reintentarlo para siempre.

El consentimiento de cookies (`apps/web/src/app/cookie-consent`) usa el módulo `privacy` para registrar cada decisión. Si `privacy` está desactivado, el banner se sigue mostrando pero las decisiones no se persisten y la analítica se trata como no consentida por defecto: es una consecuencia real de apagar el módulo, no un error.

### `tenants` — Organizaciones

Cada cliente que usa tu aplicación es un tenant. Una clínica, una empresa, un colegio. Todo dato pertenece a uno y nunca se mezcla con el de otro.

Está montado desde el principio aunque tu proyecto vaya a tener una sola organización. La razón es práctica: añadirlo después obliga a revisar cada consulta a la base de datos y cada permiso, uno por uno.

Un tenant es la organización entera y es la frontera de seguridad: todo dato y todo permiso se comprueban contra su identificador. Una sucursal o sede es una subdivisión **dentro** de un tenant, nunca un tenant aparte. Modelarla como un tenant propio rompe el caso más común: alguien que trabaja en dos sedes de la misma organización necesitaría dos cuentas, y nadie podría ver la organización completa de una vez. Las sucursales no existen todavía en este repositorio y no se deben construir por adelantado, pero cuando se añadan, cambia la forma de los permisos: hoy un rol autoriza "puede ver X"; con sucursales, autoriza "puede ver X de su sede", y esa comprobación se añade en el mismo lugar donde hoy se comprueba el tenant, nunca sustituyéndola.

### `identity` — Quién entra y qué puede hacer

Los usuarios, a qué organización pertenece cada uno, y qué rol tiene dentro de ella. El rol decide qué operaciones puede realizar.

Incluye también las claves de API, que sirven para que otro programa se conecte a tu aplicación sin ser una persona sentada delante de una pantalla.

### `documents` — Ficheros que suben los usuarios

Guarda los ficheros y lleva la cuenta de en qué estado está cada uno: subido, procesándose, procesado o fallido.

Deja preparado el sitio donde mañana conectas un OCR o un modelo de lenguaje que lea su contenido. Hoy ese hueco está vacío a propósito y no rompe nada.

### `consent` — Qué ha aceptado cada persona

Registra qué consintió alguien, para qué, y bajo qué versión de tu política de privacidad. Cuando cambias la política, el consentimiento anterior deja de valer automáticamente.

Es la base del banner de cookies y de que la analítica no se cargue mientras nadie haya dicho que sí.

### `privacy` — Los derechos que la ley da sobre los datos

Pedir una copia de todo lo que tienes sobre una persona, llevárselo a otro sitio, o que lo borres.

Aquí borrar significa anonimizar, no eliminar filas: hay datos que deben sobrevivir a la persona, como una factura o la prueba de que consintió algo. También vive aquí la retención, que es cuánto tiempo se guarda cada cosa antes de anonimizarla sola.

### `notifications` — Correo y reacciones a lo que ocurre

El envío de correo, y el mecanismo general para reaccionar cuando algo pasa. Alguien crea una organización, y eso dispara un correo de bienvenida sin que quien creó la organización tenga que saber nada del correo.

### `audit` — Quién hizo qué y cuándo

El registro de las acciones importantes: quién las hizo, sobre qué, en qué momento.

No se puede modificar ni borrar, ni siquiera con acceso directo a la base de datos. Es lo que consultas el día que alguien pregunta quién cambió algo, y es distinto de los logs, que se rotan y se pierden.

### `jobs` — Trabajo que no se hace mientras el usuario espera

Procesar un documento, enviar un correo, limpiar datos antiguos. Todo eso se encola y lo ejecuta un proceso aparte, para que la persona que pulsó el botón reciba su respuesta al instante.

Si algo falla, se reintenta solo, esperando cada vez un poco más, y se rinde después de unos cuantos intentos.

### `kernel` — Las piezas compartidas

Aparece dentro de varias capas. No es un módulo de negocio: son las herramientas que todos los demás usan. El resultado de una operación, los identificadores, los errores, la autorización, el reloj, y la clasificación de qué campos contienen datos personales.

## Cómo circula una petición

```
petición HTTP
  -> apps/web/src/api        valida el contrato, autentica, limita, comprueba idempotencia
  -> packages/adapters       el controlador traduce a la petición del caso de uso
  -> packages/application    el caso de uso autoriza y orquesta
  -> packages/domain         las entidades aplican sus reglas
  -> packages/application    la unidad de trabajo persiste y encola los eventos en el outbox
  -> packages/infrastructure el repositorio escribe en Postgres con el tenant fijado
  -> packages/adapters       el presentador prepara la respuesta
  -> apps/web                la vista la muestra
```

Los eventos encolados los recoge después `apps/worker`, fuera de la petición.

## El árbol completo

```
.claude                                      Ecosistema agéntico: qué puede hacer un agente en este repo
.claude/agents                               Subagentes especializados: arquitecto, implementador, guardián de capas, revisor de seguridad, escritor de tests
.claude/rules                                Reglas por ruta, se cargan solas al abrir un fichero de esa capa
.claude/skills                               Comandos de trabajo invocables con barra
.claude/skills/adr                           Escribir un registro de decisión
.claude/skills/gate                          Ejecutar todas las puertas y explicar cada fallo
.claude/skills/new-component                 Crear un componente de negocio en todos los anillos que necesite
.claude/skills/new-feature                   Añadir funcionalidad en el orden obligatorio de anillos
.claude/skills/new-port                      Crear un puerto con sus cinco piezas obligatorias
.github                                      Configuración del repositorio en GitHub
.github/ISSUE_TEMPLATE                       Plantillas de incidencia
.github/workflows                            Integración continua, CodeQL y escaneo de secretos
apps                                         Mecanismos de entrega, anillo 4
apps/web                                     Aplicación Next.js: HTTP y pantalla
apps/web/src                                 Código fuente de la web
apps/web/src/api                             API HTTP sobre Hono: autenticación, límite de tasa, idempotencia, captcha y mapeo de errores
apps/web/src/api/openapi                     Documento OpenAPI generado de los contratos y su página de documentación
apps/web/src/api/v1                          Definición de rutas de la versión 1
apps/web/src/app                             Rutas y páginas del App Router. Las vistas no deciden nada
apps/web/src/app/api                         Punto de montaje de la API dentro del App Router
apps/web/src/app/api/[[...route]]            Ruta atrapatodo que entrega las peticiones a Hono
apps/web/src/app/analytics                   Carga del contenedor GTM tras el consentimiento de analítica
apps/web/src/app/cookie-consent              Banner de consentimiento de cookies por categoría y su Server Action
apps/web/src/app/tenants                     Pantallas de tenants
apps/web/src/app/tenants/[slug]              Ficha de un tenant
apps/web/src/app/tenants/new                 Alta de tenant
apps/web/src/main                            Raíz de composición: el único sitio que lee configuración y construye el grafo de objetos
apps/web/test                                Tests de la web
apps/web/test/api                            Tests de las rutas HTTP contra la aplicación Hono real
apps/web/test/main                           Tests de la raíz de composición: módulos activos y desactivados
apps/worker                                  Proceso de fondo, independiente de la web
apps/worker/src                              Arranque y parada ordenada del proceso
apps/worker/src/main                         Raíz de composición del worker
apps/worker/test                             Tests del worker
apps/worker/test/main                        Tests de la raíz de composición: módulos activos y desactivados
architecture                                 La única fuente del grafo de dependencias entre capas y de qué módulos están activos
docs                                         Documentación en nodos pequeños, pensada para leerse por partes
docs/architecture                            Regla de dependencia, capas, puertos, fronteras y raíz de composición
docs/decisions                               Registros de decisión numerados: por qué las cosas son como son
docs/layers                                  Un nodo de reglas por paquete
docs/standards                               Estilo, tests, seguridad, datos personales y RGPD
docs/workflow                                Cómo añadir funcionalidad, cómo añadir un puerto, qué hacer si una puerta te para
packages                                     Los anillos 1 a 4 que no son mecanismo de entrega
packages/adapters                            Anillo 3: traductores puros, sin efectos
packages/adapters/src                        Controladores y presentadores
packages/adapters/src/documents               Controladores de subir, leer y listar documentos
packages/adapters/src/email                  Presentación del correo como una vista más
packages/adapters/src/identity               Controladores de claves de API
packages/adapters/src/kernel                 Piezas compartidas de traducción
packages/adapters/src/tenants                Controladores y presentadores de tenants
packages/adapters/test                       Tests de traductores como funciones puras
packages/adapters/test/factories             Constructores de datos para los tests de adaptadores
packages/application                         Anillo 2: casos de uso y puertos
packages/application/src                     Casos de uso agrupados por componente de negocio
packages/application/src/audit               Quién hizo qué, a qué recurso y cuándo; su consulta autorizada
packages/application/src/audit/ports         Puerto del registro de auditoría
packages/application/src/documents           Subir, listar y procesar documentos: el ejecutor de trabajos que hace avanzar la máquina de estados
packages/application/src/documents/ports     Puertos de documentos: repositorio, almacenamiento de ficheros y procesado
packages/application/src/identity            Resolver actor, registrar usuario, crear y revocar claves de API
packages/application/src/identity/ports      Puertos de identidad: proveedor, hasher, generador de secretos, repositorios
packages/application/src/jobs                Registro de ejecutores de trabajos diferidos y despacho de la cola
packages/application/src/kernel              Autorización, ámbito de tenant y puertos transversales
packages/application/src/kernel/ports        Permisos, reloj, unidad de trabajo, outbox, cola de trabajos, logger, idempotencia, límite de tasa
packages/application/src/notifications       Despacho del outbox y envío de correo
packages/application/src/notifications/ports Puerto de correo y registro de manejadores de eventos
packages/application/src/privacy             Consentimiento y derechos del interesado: acceso, portabilidad, supresión y retención
packages/application/src/privacy/jobs        Ejecutores diferidos de exportación, supresión y barrido de retención
packages/application/src/privacy/ports       Puertos de privacidad: repositorio de consentimiento, fuentes de datos y de anonimización
packages/application/src/tenants             Crear tenant y leerlo por slug
packages/application/src/tenants/ports       Repositorio de tenants
packages/application/test                    Tests de casos de uso contra puertos en memoria
packages/application/test/doubles            Dobles de puerto usados solo en tests de aplicación
packages/application/test/factories          Constructores de datos para los tests de aplicación
packages/contracts                           Anillo 3: esquemas de entrada y salida de la API
packages/contracts/src                       Contratos y sus metadatos de autenticación, captcha, idempotencia y límite de tasa
packages/contracts/src/kernel                Piezas compartidas de los contratos
packages/contracts/src/v1                    Contratos de la versión 1 de la API
packages/contracts/src/v1/documents           Contratos de subir, leer y listar documentos
packages/contracts/src/v1/identity           Contratos de claves de API
packages/contracts/src/v1/tenants            Contratos de tenants
packages/contracts/test                      Tests de validación y de forma del documento OpenAPI
packages/domain                              Anillo 1: las reglas de negocio
packages/domain/src                          Agregados, objetos de valor y piezas compartidas
packages/domain/src/consent                  El agregado Consent: qué se consintió, bajo qué versión de política, y su retirada sin borrado
packages/domain/src/documents                 El agregado Document: máquina de estados pendiente, procesando, procesado o fallido
packages/domain/src/identity                 Usuario, membresía, clave de API y matriz de roles
packages/domain/src/kernel                   Result, identificadores, eventos, errores y clasificación de datos personales
packages/domain/src/tenants                  El agregado Tenant
packages/domain/test                         Invariantes, un fichero por agregado
packages/domain/test/factories               Constructores de agregados para los tests de dominio
packages/infrastructure                      Anillo 4: lo que habla de verdad con el mundo
packages/infrastructure/migrations           SQL versionado: tablas, rol app_user y seguridad a nivel de fila
packages/infrastructure/migrations/meta      Estado que genera Drizzle para calcular la siguiente migración
packages/infrastructure/src                  Una carpeta por proveedor, más la implementación en memoria
packages/infrastructure/src/analytics        Envío de eventos de servidor a Measurement Protocol
packages/infrastructure/src/crypto           Hash de claves de API con pimienta y comparación en tiempo constante
packages/infrastructure/src/documents        El punto de enchufe del procesado real: NullDocumentProcessor, a sustituir por OCR o modelo
packages/infrastructure/src/memory           Implementación en memoria de cada puerto, completa, no un esbozo
packages/infrastructure/src/memory/documents Repositorio de documentos, almacenamiento de ficheros y procesador en memoria
packages/infrastructure/src/memory/identity  Repositorios de identidad en memoria
packages/infrastructure/src/memory/privacy   Repositorio de consentimiento en memoria
packages/infrastructure/src/memory/tenants   Repositorio de tenants en memoria
packages/infrastructure/src/otel             Telemetría real con OpenTelemetry, exportada a Sentry por OTLP
packages/infrastructure/src/postgres         Esquema Drizzle, repositorios, unidad de trabajo, outbox y contexto de transacción
packages/infrastructure/src/postgres/documents Repositorio de documentos sobre Postgres
packages/infrastructure/src/postgres/identity Repositorios de identidad sobre Postgres
packages/infrastructure/src/postgres/jobs    Cola de trabajos diferidos sobre Postgres, con reintento y espera creciente
packages/infrastructure/src/postgres/privacy Repositorio de consentimiento sobre Postgres
packages/infrastructure/src/postgres/schema  Definición de tablas en Drizzle
packages/infrastructure/src/postgres/tenants Repositorio de tenants sobre Postgres
packages/infrastructure/src/resend           Envío de correo
packages/infrastructure/src/supabase         Proveedor de identidad y almacenamiento de ficheros sobre Supabase Storage
packages/infrastructure/src/turnstile        Verificación de humano
packages/infrastructure/test                 Tests de infraestructura
packages/infrastructure/test/contracts       Una suite por puerto, la misma para memoria y para el proveedor real
packages/infrastructure/test/factories       Constructores de datos para los tests de infraestructura
scripts                                      Herramientas propias, fuera de los anillos
scripts/agent                                Hooks de Claude Code: revisan lo que se va a escribir y lo que se va a ejecutar
scripts/architecture                         El comprobador propio de capas, comentarios, any y process.env
scripts/db                                   Configuración de Drizzle y aplicación de migraciones
scripts/load                                 Guiones de carga con k6 contra la API, umbrales incluidos
```

## Las filas nunca salen, la configuración nunca entra

Dos fronteras que conviene tener presentes al leer el árbol:

Una fila de base de datos se convierte en entidad dentro de `packages/infrastructure` y nunca cruza hacia fuera. Un tipo de proveedor tampoco.

La configuración se lee en `apps/*/src/main` y en ningún otro sitio. El comprobador de arquitectura rechaza cualquier `process.env` fuera de ahí. Un paquete recibe sus clientes ya construidos, nunca se los fabrica.

## Lo que aún no existe

El esqueleto está pensado para que estas piezas entren sin mover las anteriores. Cada una tiene su sitio decidido, y ninguno de estos directorios existe todavía: `bun run structure` falla si alguno aparece sin salir de aquí y entrar en el árbol.

```
packages/domain/src/billing                  Pagos: ciclo de facturación propio, para que cambiar de proveedor sea cambiar un adaptador
packages/application/src/billing             Pagos: suscribir, facturar, conciliar, y sus puertos
packages/infrastructure/src/stripe           Pagos: el proveedor, un solo sitio que sustituir por Redsys
packages/application/src/search              Búsqueda: el puerto y sus casos de uso
packages/infrastructure/src/search           Búsqueda: el proveedor real
packages/application/src/webhooks            Webhooks salientes: firma, reintento y registro de entregas
packages/application/src/transfer            Importación y exportación de datos de negocio, no de datos personales
scripts/setup                                Arranque de un proyecto derivado: migrar, crear el bucket, verificar y sembrar el primer tenant
```

Caché y banderas de funcionalidad no llevan carpeta propia: la caché es un puerto en `packages/application/src/kernel/ports` con su implementación real junto a las demás, y las banderas de funcionalidad son un puerto más una tabla con aislamiento por tenant, no variables de entorno.

El patrón se repite siempre: la capacidad se declara como puerto en el anillo 2, se prueba con una suite de contrato, se implementa dos veces (memoria y proveedor real) y se conecta en la raíz de composición. Nada de esto obliga a tocar el dominio.

## Huecos conocidos

Deuda concreta, no capacidades nuevas. Vive aquí para que no se pierda:

| Hueco | Por qué importa |
| --- | --- |
| No hay pantalla de acceso, y la resolución de actor redirige a ella | Sin ella no hay forma de entrar salvo por clave de API |
| Un despliegue nuevo no puede crear su primer tenant | Crear un tenant exige un actor, que exige un usuario, que exige un tenant. Lo resuelve el arranque sembrando el primero |
| Nada siembra el primer trabajo de retención de cada tenant | Una política de retención que nunca se ejecuta aparenta cumplir sin cumplir |
| Sin ruta HTTP para consultar la auditoría ni para gestionar membresías | Los casos de uso existen y nadie puede llamarlos |
| Sin pantallas de documentos | Solo hay API y worker |
| Nadie limpia los objetos de almacenamiento cuya subida nunca se confirmó | Crecen sin límite y nadie los reclama |
| Nadie purga los trabajos completados ni agotados | La tabla crece siempre; el rol de aplicación no puede borrar, así que hace falta mantenimiento con la conexión privilegiada |
| Ninguna suite de contrato se ha ejecutado contra un proveedor real | Están escritas y se saltan. Es lo único que puede desmentir lo que creemos que funciona |

## Este documento se actualiza siempre

Es una regla dura, no una costumbre. Quien añade un directorio lo describe aquí en el mismo cambio, y quien lo borra retira su línea. `bun run structure` compara el árbol real con el que figura arriba y falla si difieren; forma parte de `bun run check`, así que lo verifican los hooks de git y la integración continua igual que el resto.

## Dónde mirar

| Si quieres | Ve a |
| --- | --- |
| saber dónde va un trozo de código | `docs/architecture/dependency-rule.md` |
| añadir una funcionalidad | `docs/workflow/new-feature.md` |
| que un caso de uso hable con el exterior | `docs/workflow/new-port.md` |
| entender por qué algo es así | `docs/decisions/` |
| trabajar con agentes en este repo | `AGENTS.md` |
| montar el proyecto y desplegarlo | `README.md` |
