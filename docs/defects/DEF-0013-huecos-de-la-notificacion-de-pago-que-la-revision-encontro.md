---
id: DEF-0013
date: 2026-09-08
found_in: revisiones de layer-guardian y security-reviewer sobre la rama claude/payments-stripe-base, antes de fusionarla
prevented_by: test
test: packages/domain/test/payment.test.ts
---

# DEF-0013 La ruta del webhook de pago llegó a revisión con cuatro huecos, dos cerrados aquí y dos que siguen abiertos a propósito

## Qué pasó

Las dos revisiones obligatorias leyeron el diff completo del módulo de pagos y encontraron ocho cosas. Cuatro merecen registro.

**Cerrados en este mismo cambio:**

- La comparación de la firma no hacía lo que dice la decisión 0030. En vez de reducir las dos partes a una huella de longitud fija antes de `timingSafeEqual`, rellenaba con ceros o **truncaba** el digest recibido a 32 bytes, descartando en silencio lo que sobrara. No era explotable hoy, porque el lado esperado mide siempre exactamente 32 bytes, pero era una implementación distinta de la que el registro de decisión describe, y la siguiente persona que intentara «arreglarla» hacia la letra del documento habría reintroducido la excepción por longitudes distintas. Ahora las dos partes pasan por SHA-256 antes de compararse, igual que `apps/web/src/api/cron-secret.ts`. La pasarela en memoria tenía además la variante peor del mismo error: devolvía `false` ante longitudes distintas *antes* de comparar, que es exactamente el anti-patrón que la decisión 0028 rechazó.
- `Payment.settle` solo comprobaba la referencia del proveedor cuando el pago ya estaba liquidado. En la transición de `pending` a `succeeded` sobrescribía sin preguntar la referencia que se había guardado al iniciar el cobro. Era cierto por construcción — el caso de uso manda siempre la misma —, es decir, una invariante que vivía en la disciplina de quien llama y no en el objeto que la posee. Ahora liquidar con una referencia distinta de la que el pago lleva atada es un conflicto, y `packages/domain/test/payment.test.ts` lo fija.
- El cuerpo del webhook se leía entero antes de mirar su tamaño. Ahora se rechaza por `Content-Length` antes de leer nada, y el límite se vuelve a comprobar sobre lo leído.
- El controlador respondía el importe y la moneda copiándolos de lo que el cliente había enviado, no de lo que el caso de uso registró. Coincidían siempre, porque `Money` valida igual en los dos lados, pero la respuesta de la API no venía del agregado persistido y nada habría detectado que dejaran de coincidir. El modelo de respuesta los lleva ahora, y la prueba del controlador afirma justo eso.

**Abiertos entonces, y por qué:**

- **No hay bloqueo de fila entre leer el pago y escribir su transición.** Dos notificaciones legítimas para el mismo pago que lleguen a la vez pueden leer las dos el estado `pending` y escribir las dos; gana la última en confirmar, sin conflicto. Cerrarlo bien es un `SELECT ... FOR UPDATE` dentro de la misma transacción que guarda, y eso choca con que la unidad de trabajo se abre con el tenant del pago, que no se conoce hasta haberlo leído: hay que decidir si esa transacción se abre en ámbito de registro y qué implica para el aislamiento por fila. Es una decisión de diseño, no una corrección, y se toma despierto.
- **El aislamiento entre clientes en la ruta del webhook descansa entero sobre la firma.** El pago se resuelve por identificador en ámbito de registro, que es lo que la ruta necesita porque una notificación llega antes de saber de quién es. La firma es la única puerta antes de esa búsqueda. Stripe ya devuelve `metadata[tenantId]`, que nosotros mismos enviamos al crear la sesión, así que existe una segunda comprobación barata — que el tenant de la notificación sea el del pago encontrado — que hoy no se hace.

Las dos quedaron nombradas en el pull request para que quien lo revisara decidiera, en vez de fusionarse en silencio. La decisión ya se tomó despierta, y las dos se cierran en un cambio posterior sobre la misma rama, registrado aparte porque lo prueba un fichero distinto de éste.

## Por qué ninguna puerta existente lo vio

Ninguna de las cuatro es una regla que un script pueda leer del árbol: son propiedades de lo que el código *hace*. La de la firma es la más instructiva, porque el fichero pasaba todas las puertas y todas sus pruebas: la suite de contrato comprueba que una firma manipulada se rechaza, y una firma manipulada de 32 bytes se rechaza igual de bien con el relleno que con la huella. Lo que la suite no podía ver es que la implementación y su registro de decisión contaban historias distintas, y eso solo lo encuentra alguien que lea las dos cosas a la vez, que es literalmente lo que la regla 13 encarga.
