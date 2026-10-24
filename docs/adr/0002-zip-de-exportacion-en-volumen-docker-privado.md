# ZIP de exportación de datos en un volumen local privado de Docker

El ZIP de la exportación de datos (RGPD art. 15 y 20) se guarda, con un nombre no adivinable, en un **volumen local privado de Docker**, sin almacenamiento externo (MinIO/S3, descartado en el ticket 06). NGINX **no** expone esa carpeta: el ZIP solo sale por `GET /api/gdpr/export/{export_id}/download`, que comprueba sesión del mismo usuario, pertenencia del `export_id` y fecha de caducidad antes de leer el fichero. Se elimina del disco a los 7 días o de inmediato si el usuario borra su cuenta. Se eligió el volumen local porque el equipo ya había descartado el almacenamiento de objetos y el ZIP es temporal y de un solo destinatario.

## Considered Options

- **Almacenamiento externo (MinIO/S3):** descartado por el equipo en el ticket 06; añade un servicio y credenciales que el proyecto no necesita para un fichero de vida corta.
- **Disco del servidor fuera de un volumen:** descartado; no queda separado del contenedor de la aplicación y no se distingue de otros datos.
- **Servir la carpeta con NGINX:** descartado; un enlace con nombre no adivinable no basta, porque la descarga debe exigir sesión y pertenencia en el servidor.

## Consequences

- **La descarga pasa por la aplicación.** Sesión, pertenencia y caducidad se comprueban en el servidor en cada descarga; no basta el rol del JWT ni `proxy.ts`.
- **Borrado doble.** El ZIP debe desaparecer del disco en la caducidad y en el borrado de cuenta. Hace falta una tarea que elimine los caducados y que el borrado de cuenta también borre el fichero, no solo el registro de la exportación.
- **El ZIP contiene RPE y Feedback del propio usuario**, que son datos de salud. El volumen debe quedar fuera de copias o rutas accesibles a terceros; el email de aviso lleva solo el enlace y la fecha, nunca datos.
- **Un solo volumen.** Con la aplicación en un único proceso (ver 0001) no hay problema; si se escala a varias réplicas, el volumen local no se comparte entre ellas.
- **Logs y eventos con `export_id`.** Los logs, errores, eventos SSE y notificaciones de la exportación llevan solo `export_id`, nunca el contenido del ZIP.
