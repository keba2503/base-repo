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
apps/web/src/app/tenants                     Pantallas de tenants
apps/web/src/app/tenants/[slug]              Ficha de un tenant
apps/web/src/app/tenants/new                 Alta de tenant
apps/web/src/main                            Raíz de composición: el único sitio que lee configuración y construye el grafo de objetos
apps/web/test                                Tests de la web
apps/web/test/api                            Tests de las rutas HTTP contra la aplicación Hono real
apps/worker                                  Proceso de fondo, independiente de la web
apps/worker/src                              Arranque y parada ordenada del proceso
apps/worker/src/main                         Raíz de composición del worker
architecture                                 La única fuente del grafo de dependencias entre capas
docs                                         Documentación en nodos pequeños, pensada para leerse por partes
docs/architecture                            Regla de dependencia, capas, puertos, fronteras y raíz de composición
docs/decisions                               Registros de decisión numerados: por qué las cosas son como son
docs/layers                                  Un nodo de reglas por paquete
docs/standards                               Estilo, tests, seguridad, datos personales y RGPD
docs/workflow                                Cómo añadir funcionalidad, cómo añadir un puerto, qué hacer si una puerta te para
packages                                     Los anillos 1 a 4 que no son mecanismo de entrega
packages/adapters                            Anillo 3: traductores puros, sin efectos
packages/adapters/src                        Controladores y presentadores
packages/adapters/src/email                  Presentación del correo como una vista más
packages/adapters/src/identity               Controladores de claves de API
packages/adapters/src/kernel                 Piezas compartidas de traducción
packages/adapters/src/tenants                Controladores y presentadores de tenants
packages/adapters/test                       Tests de traductores como funciones puras
packages/adapters/test/factories             Constructores de datos para los tests de adaptadores
packages/application                         Anillo 2: casos de uso y puertos
packages/application/src                     Casos de uso agrupados por componente de negocio
packages/application/src/documents           Subir, listar y procesar documentos: el ejecutor de trabajos que hace avanzar la máquina de estados
packages/application/src/documents/ports     Puertos de documentos: repositorio, almacenamiento de ficheros y procesado
packages/application/src/identity            Resolver actor, registrar usuario, crear y revocar claves de API
packages/application/src/identity/ports      Puertos de identidad: proveedor, hasher, generador de secretos, repositorios
packages/application/src/jobs                Registro de ejecutores de trabajos diferidos y despacho de la cola
packages/application/src/kernel              Autorización, ámbito de tenant y puertos transversales
packages/application/src/kernel/ports        Permisos, reloj, unidad de trabajo, outbox, cola de trabajos, logger, idempotencia, límite de tasa
packages/application/src/notifications       Despacho del outbox y envío de correo
packages/application/src/notifications/ports Puerto de correo y registro de manejadores de eventos
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
packages/infrastructure/src/crypto           Hash de claves de API con pimienta y comparación en tiempo constante
packages/infrastructure/src/documents        El punto de enchufe del procesado real: NullDocumentProcessor, a sustituir por OCR o modelo
packages/infrastructure/src/memory           Implementación en memoria de cada puerto, completa, no un esbozo
packages/infrastructure/src/memory/documents Repositorio de documentos, almacenamiento de ficheros y procesador en memoria
packages/infrastructure/src/memory/identity  Repositorios de identidad en memoria
packages/infrastructure/src/memory/tenants   Repositorio de tenants en memoria
packages/infrastructure/src/postgres         Esquema Drizzle, repositorios, unidad de trabajo, outbox y contexto de transacción
packages/infrastructure/src/postgres/documents Repositorio de documentos sobre Postgres
packages/infrastructure/src/postgres/identity Repositorios de identidad sobre Postgres
packages/infrastructure/src/postgres/jobs    Cola de trabajos diferidos sobre Postgres, con reintento y espera creciente
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
```

## Las filas nunca salen, la configuración nunca entra

Dos fronteras que conviene tener presentes al leer el árbol:

Una fila de base de datos se convierte en entidad dentro de `packages/infrastructure` y nunca cruza hacia fuera. Un tipo de proveedor tampoco.

La configuración se lee en `apps/*/src/main` y en ningún otro sitio. El comprobador de arquitectura rechaza cualquier `process.env` fuera de ahí. Un paquete recibe sus clientes ya construidos, nunca se los fabrica.

## Lo que aún no existe

El esqueleto está pensado para que estas piezas entren sin mover las anteriores. Cada una tiene ya su sitio decidido:

| Pieza | Dónde irá |
| --- | --- |
| Documentos y su procesado por OCR o modelo | Agregado en `packages/domain/src/documents`, puerto de almacenamiento y puerto de procesado en `packages/application`, Supabase Storage en `packages/infrastructure/src/supabase` |
| Consentimiento, derechos RGPD y cifrado por clasificación | `packages/domain/src/consent`, casos de uso de acceso, portabilidad y borrado en `packages/application/src/privacy`, cifrado en `packages/infrastructure/src/crypto` |
| Observabilidad, trazas y métricas | Puerto de telemetría en `packages/application/src/kernel/ports`, exportador en `packages/infrastructure/src/otel`, analítica en `apps/web` tras el consentimiento |
| Pagos, con Stripe intercambiable por Redsys | Ciclo de facturación propio en `packages/domain/src/billing`, un proveedor por carpeta en `packages/infrastructure` y un solo adaptador que cambiar |
| Caché, banderas de funcionalidad, webhooks, búsqueda, importación y exportación | Un puerto cada uno en `packages/application`, su implementación en memoria y su proveedor real en `packages/infrastructure` |

El patrón se repite siempre: la capacidad se declara como puerto en el anillo 2, se prueba con una suite de contrato, se implementa dos veces (memoria y proveedor real) y se conecta en la raíz de composición. Nada de esto obliga a tocar el dominio.

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
