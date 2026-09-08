---
id: DEF-0014
date: 2026-09-08
found_in: trabajo secrets de la integración continua en el pull request #2, gitleaks marcando packages/infrastructure/test/stripe.test.ts
prevented_by: none
reason: ninguna puerta de este repositorio puede distinguir una credencial inventada de una real, que es precisamente el trabajo de gitleaks; lo que cambia es que la de la prueba ya no tiene forma de credencial
---

# DEF-0014 Una clave de prueba con la forma exacta de una clave real hizo saltar el escaneo de secretos

## Qué pasó

Las pruebas del adaptador de Stripe necesitan un secreto de firma para calcular un HMAC contra el que verificar. El fichero lo declaraba como `whsec_test_0123456789abcdef`: inventado, sin valor, y con el prefijo real que Stripe usa para los secretos de sus webhooks. Gitleaks lo detectó como `generic-api-key` con entropía 4.28 y dejó el trabajo `secrets` en rojo.

El escáner tenía razón en lo que puede saber. Una cadena con el prefijo de un proveedor y entropía alta es indistinguible de una credencial de verdad para cualquier herramienta, y para cualquier persona que la vea en un diff a las tres de la mañana. El HMAC no necesita esa forma en absoluto: el secreto de la prueba es ahora una frase legible que no se parece a nada que Stripe emita.

Queda además `.gitleaksignore` con la huella exacta del hallazgo histórico — commit, fichero, regla y línea —, porque el escaneo de un pull request recorre sus commits y el valor viejo sigue existiendo en el que lo introdujo. Esa huella no puede tapar ningún hallazgo futuro: nombra un commit concreto que ya no puede cambiar.

## Por qué ninguna puerta existente lo vio

Porque la puerta que lo vio es la que corresponde, y funcionó: gitleaks está en la integración continua justamente para esto. Lo que no existe, ni puede existir, es algo que impida escribir una credencial falsa con forma de credencial real; la única defensa es no escribirlas, y la única señal es la que llegó. Vale la pena registrarlo porque el reflejo natural ante un falso positivo es silenciar el escáner, y aquí lo que se corrigió fue la prueba.
