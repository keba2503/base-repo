---
id: DEF-0028
date: 2026-09-11
found_in: segunda pasada de security-reviewer sobre el diff de la corrección de privacy
prevented_by: none
reason: borrar un export tras su entrega exige saber cuándo se entregó, y ese evento no existe hoy en el flujo; sin él la limpieza tendría que adivinar por antigüedad, y el TTL correcto depende de una decisión de producto sobre cuánto puede tardar el sujeto en descargar su exportación
---

# DEF-0028 El fichero de exportación de datos personales se guarda sin caducidad ni borrado tras la entrega

## Qué pasó

`exportSubjectDataExecutor` escribe en el `FileStore` un JSON con los campos personales y sensibles del sujeto (email, displayName, y cualquier otro que las fuentes clasifiquen así) y no programa su borrado. El fichero queda en el bucket indefinidamente. Es exactamente el mismo problema que la retención de 365 días del propio diff resuelve para las filas de base de datos, sin resolver para el artifact que esas filas producen.

## Por qué ninguna puerta existente lo vio

El gate de defects comprueba que cada defecto declare cómo se impide que vuelva, y la suite de contrato de los sources verifica el contenido del export, no su ciclo de vida. La decisión de cuánto vive un export no está escrita en ningún sitio del árbol, y el `FileStore` no expone un método de borrado con caducidad: el flujo de entrega (una URL firmada con vida corta) tampoco emite un evento que un job pudiera escuchar para limpiar.

## Qué lo impediría que vuelva

Dos piezas: un método de borrado por antigüedad o por clave en `FileStore`, y un job que borre los exports pasada su ventana de entrega, encolado junto al export mismo. La ventana es una decisión de producto — cuánto tiempo puede tardar un sujeto en descargar lo que pidió — y por eso queda como decisión pendiente con este registro como marcador.