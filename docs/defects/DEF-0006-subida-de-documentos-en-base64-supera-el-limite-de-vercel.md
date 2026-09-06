---
id: DEF-0006
date: 2026-09-06
found_in: revisión previa al despliegue en Vercel del flujo de subida de documentos
prevented_by: none
reason: el límite pertenece a la plataforma de despliegue elegida por cada proyecto derivado, no al código de este repositorio; un gate tendría que conocer y fijar de antemano un proveedor de hosting que este repositorio deliberadamente no fija
---

# DEF-0006 La subida de documentos iba en base64 por el cuerpo JSON con un límite anunciado imposible en Vercel

## Qué pasó

El endpoint de subida de documentos aceptaba el fichero codificado en base64 dentro del cuerpo JSON de la petición, con un límite anunciado de 20MB. Base64 infla el tamaño real en aproximadamente un tercio, así que 20MB de fichero se convertían en unos 27MB de cuerpo de petición. Vercel corta el cuerpo de una función serverless en 4.5MB: el límite anunciado era, en la práctica, imposible de alcanzar en el entorno de despliegue objetivo de este repositorio.

## Por qué ninguna puerta existente lo vio

Este es el caso interesante del lote: no acabó en ninguna puerta ni en ningún test, y la razón no es que nadie se acordara sino que la propiedad que fallaba no es del código sino de la infraestructura de despliegue elegida. `bun run check` corre en un entorno que no impone ningún límite de tamaño de cuerpo HTTP; el límite de 4.5MB es específico de Vercel, y ni siquiera es un valor fijo garantizado a futuro. Un test que afirmara "un cuerpo de 27MB falla" solo sería cierto contra un proveedor concreto, y este repositorio existe precisamente para no acoplar sus reglas a un proveedor. Escribir ese test habría exigido inventar un límite arbitrario en el propio repositorio, que es exactamente el tipo de mecanismo que un registro honesto no debe fingir tener.

## Qué se hizo en su lugar

Se cambió el diseño, no se añadió un mecanismo: `createDocumentUpload` emite una URL firmada de subida directa a `FileStore`, y `confirmDocumentUpload` lee los bytes ya subidos, detecta el tipo de contenido y crea el `Document`. El cuerpo de la API nunca vuelve a llevar el fichero. Ver decisión 0016. Un proyecto derivado que despliegue en una plataforma sin ese límite podría, si quisiera, justificar volver al cuerpo base64 con su propia decisión — pero seguiría siendo una elección de diseño, no algo que este registro pueda comprobar de forma mecánica.
