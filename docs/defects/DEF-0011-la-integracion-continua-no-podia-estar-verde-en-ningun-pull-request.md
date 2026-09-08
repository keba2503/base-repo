---
id: DEF-0011
date: 2026-09-08
found_in: primera ejecución real de la integración continua, en el pull request #1, con tres de siete comprobaciones en rojo
prevented_by: none
reason: los tres fallos solo aparecen ejecutando los flujos de trabajo dentro de un pull request de GitHub, con su token y sus permisos reales; nada en el árbol los distingue de una configuración correcta, y este repositorio no tiene forma de ejecutar GitHub Actions contra sí mismo
---

# DEF-0011 La integración continua de este repositorio no podía estar verde en ningún pull request, y nadie lo supo hasta que hubo uno

## Qué pasó

El pull request #1 fue el primero de la historia del repositorio. Tres de sus siete comprobaciones fallaron, por tres causas distintas y todas anteriores al cambio que las destapó:

- **`check`**: `apps/web` usa `LayoutProps`, un tipo global que Next 16 genera en `.next/types` y que no existe en una copia recién clonada. `bun run typecheck` lo daba por presente porque en la máquina de quien lo escribió ya lo había generado un `next dev` o un `next build` anterior. En el runner no había nada, así que `bun run check` fallaba en la comprobación de tipos del único paquete que se despliega. El arreglo es que `apps/web` genere sus propios tipos antes de comprobarlos: `next typegen && tsc --noEmit`.
- **`secrets`**: el escaneo de gitleaks pedía `GET /repos/.../pulls/1/commits` y recibía un 403. El flujo declara `permissions: contents: read` a nivel de fichero, que en un pull request no incluye leer el pull request. El arreglo son dos líneas de permisos en ese trabajo, `pull-requests: read`.
- **`analyze`**: CodeQL terminaba en «configuration error» pidiendo `GET /actions/runs/...`. Le faltaba `actions: read`, que su propia documentación exige junto a `security-events: write`.

## Por qué ninguna puerta existente lo vio

Porque las tres son propiedades de la ejecución, no del árbol, y este repositorio no tiene ninguna forma de ejercerlas contra sí mismo: hasta el pull request #1 nadie había abierto uno, y un flujo de trabajo con permisos insuficientes es indistinguible de uno correcto mientras nadie lo dispare. El caso de `LayoutProps` es más incómodo, porque sí es del árbol: lo que falla no es el código sino la suposición de que el entorno de quien lo escribe ya contiene un artefacto generado. Una comprobación que solo pasa en la máquina donde ya se ejecutó otra cosa no está comprobando nada, y esa es exactamente la clase de fallo que DEF-0009 acaba de dejar registrada un piso más abajo: una suite que no se ejecutaba de verdad y una comprobación de tipos que se apoyaba en restos de una ejecución anterior son el mismo error visto dos veces.

Queda en `none` porque la única puerta honesta sería ejecutar los flujos de trabajo de GitHub dentro de un pull request de GitHub, que es precisamente lo que acaba de ocurrir. Lo que sí cambia es que a partir de ahora existe el pull request que los ejecuta: el hueco no era de medición, era de no haber estrenado nunca el mecanismo.
