---
id: DEF-0012
date: 2026-09-08
found_in: revisión de diseño del agente architect sobre el primer anillo de pagos, ya escrito y en verde
prevented_by: test
test: packages/domain/test/payment.test.ts
---

# DEF-0012 Un pago se liquidaba con cualquier importe, y Money tenía una puerta trasera para construirse sin validar

## Qué pasó

El primer anillo del módulo de pagos se escribió, pasó `bun run check` con 169 pruebas en verde, y tenía dos agujeros que ninguna de esas pruebas podía ver porque ninguna preguntaba por ellos.

El primero: `Payment.settle` aceptaba una referencia del proveedor y una fecha, y nada más. No comparaba el importe realmente cobrado con el importe por el que se creó el pago. Una sesión equivocada emparejada con un pago, o un error de unidades en un adaptador, lo habría liquidado como correcto y el sistema habría dado por bueno un cobro por otra cantidad. Es el peor fallo posible en el único agregado que representa dinero, y era invisible: el estado quedaba coherente, el evento se registraba, y toda prueba escrita contra el comportamiento existente pasaba.

El segundo: junto a `Money.create`, que valida, existían `Money.restoreValidated` y `moneyOf`, exportados desde el barril del módulo y por tanto alcanzables desde cualquier anillo que importe `@base/domain`. `moneyOf(12.34, "EUR")` compilaba y devolvía un `Money` que rompe la invariante sobre la que descansa el diseño entero. Un objeto de valor cuyas invariantes se pueden saltar llamando a otra función con otro nombre no es un objeto de valor: es una convención.

## Por qué ninguna puerta existente lo vio

Porque las dos son ausencias, y ninguna puerta de este repositorio mide ausencias de reglas. El comprobador de arquitectura mira dependencias entre anillos; la comprobación de tipos mira que las firmas encajen — y encajaban, porque una firma sin el parámetro que falta es perfectamente coherente consigo misma; las pruebas miden el comportamiento que alguien decidió escribir, y quien escribe el código y quien escribe sus pruebas tenían aquí el mismo punto ciego, que es exactamente lo que la regla 13 existe para romper. La puerta trasera de `Money` tiene además una explicación que la hacía parecer correcta: imita el idioma `tenantIdOf`/`entityIdOf` de `kernel/identifiers.ts`, que sí convierte sin validar. La diferencia es que un identificador no tiene invariantes que romper y un importe sí.

`settle` ahora exige el importe pagado y rechaza cualquiera que difiera en número o en moneda, dejando el pago en `pending`; `packages/domain/test/payment.test.ts` fija las dos formas de ese rechazo. `Money` perdió su segundo constructor: `Payment.restore` reconstruye su importe a través de `Money.create` y propaga el error como cualquier otra validación.
