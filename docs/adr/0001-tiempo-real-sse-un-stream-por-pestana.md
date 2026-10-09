# Tiempo real con un stream SSE por pestaña y Postgres LISTEN/NOTIFY

El tiempo real (chat de Event, DM, notificaciones, Spot Requests, contador de apuntados, estado online) va por **un único stream SSE por pestaña** (`/api/events`) que multiplexa todos los tipos de evento, en lugar de un stream por canal, para no chocar con el límite de 6 conexiones por dominio de HTTP/1.1 y tener un solo punto de autenticación. Las escrituras llaman a una **función central `publish`** que hace `pg_notify` dentro de la misma transacción (se entrega al hacer commit); un único listener `pg` por proceso Node reparte los eventos y resuelve los destinatarios **en la base de datos en el momento de la entrega**, para respetar el rol y la membresía vigentes. Se eligió SSE frente a WebSocket porque el canal cliente → servidor ya lo cubre HTTP (`POST`) y SSE trae reconexión y `Last-Event-ID` de serie; el riesgo de que el evaluador no lo acepte como "similar" está asumido por el equipo.

## Considered Options

- **Un stream por canal** (chat, notificaciones…): descartado por el límite de conexiones y porque multiplica los puntos de autenticación.
- **Triggers SQL para el `NOTIFY`**: descartados; esconden lógica en SQL que el equipo no lee, no tienen el contexto de permisos para decidir destinatarios y el módulo Notification pide un mecanismo central testeable en la aplicación.
- **Destinatarios calculados al escribir** (ids en el payload del `NOTIFY`): descartado; un usuario expulsado entre escritura y entrega seguiría recibiendo, y en chats grandes se supera el límite de 8000 bytes.
- **Tabla única de eventos (outbox)** con un solo id para el reenvío: descartada para no reabrir el esquema del ticket 02; se usa un cursor combinado.

## Consequences

- **Un solo proceso Node.** Conexiones y estado online viven en memoria. Escalar a varias réplicas obligaría a mover el estado online a un sitio compartido.
- **Cursor combinado.** El `id:` de cada evento es `<último message id>-<último notification id>`. Amplía lo dicho en el ticket 02 (solo `notifications.id`) sin cambiar el esquema.
- **Commits fuera de orden.** `bigserial` asigna el id al insertar, pero el `NOTIFY` llega al commit. Al reconectar se reenvían los mensajes con id > cursor − 50 y el cliente ordena por id y descarta duplicados.
- **Los eventos solo llevan ids.** El contenido se pide a endpoints que comprueban permisos; RPE y Feedback nunca van en el evento ni en `notifications.payload`.
