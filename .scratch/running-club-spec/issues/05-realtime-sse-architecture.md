# Arquitectura de tiempo real con SSE

Type: grilling
Status: open
Assignee: jmateo-v
Blocked by: 01

## Question

¿Cómo se diseña el tiempo real? Chat de Event (solo admitidos, administrado por Managers), DM entre Contacts, notificaciones, aprobación de reservas y contador de apuntados. Decidir: un stream por usuario o por canal, uso de Postgres LISTEN/NOTIFY, reconexión y reenvío de mensajes perdidos, y cómo se justifica SSE ante el evaluador.

## Answer

Decisión de arquitectura en `docs/adr/0001-tiempo-real-sse-un-stream-por-pestana.md`.

### Stream

- **Un stream SSE por pestaña** (`/api/events`) que lleva todo. Cada evento tiene un `event:` (tipo) y el cliente lo enruta.
- **Al abrir**, el stream no envía nada antiguo: las páginas cargan los datos iniciales (endpoints o SSR) y el stream solo trae cambios. Envía un primer `id:` con el cursor actual. Un usuario que estaba desconectado ve sus mensajes al abrir el chat, porque la página los lee de la base de datos.

### Dos clases de evento

| Clase | Ejemplos | Al reconectar |
|---|---|---|
| **Reenviable** (guardado con id creciente) | mensaje de chat de Event, DM, Notification | se reenvía lo perdido usando `Last-Event-ID` |
| **Señal** ("esto cambió, vuelve a pedirlo") | contador de apuntados, estado de Spot Request, estado online, dashboard | no se reenvía; el cliente recarga el estado actual |

### Publicación y reparto

- **Función central `publish`** en la aplicación, llamada por cada escritura dentro de su transacción. Hace `pg_notify`, que Postgres entrega al hacer commit (si la transacción falla, no se notifica). Sin triggers SQL.
- El payload del `NOTIFY` y `notifications.payload` llevan **solo ids**. Nunca RPE ni Feedback.
- **Un listener por proceso Node** con un `Client` de `pg` dedicado (Prisma no tiene `LISTEN`), guardado en `globalThis`.
- **Destinatarios resueltos en la base de datos en el momento de la entrega** (miembros vigentes de la conversación; `notifications.user_id` para las notificaciones). Si alguien deja de ser Contact o es expulsado de un chat, deja de recibir.
- **Un solo proceso Node**; conexiones y estado online en memoria. Documentarlo en el README.

### Reconexión

- **Cursor combinado:** `id: <último message id>-<último notification id>`. Amplía el ticket 02 (que solo nombraba `notifications.id`) sin cambiar el esquema.
- Al reconectar se reenvían las notificaciones con id > cursor y los mensajes con id > cursor − 50 (solape por commits fuera de orden). El cliente ordena por id y descarta duplicados.

### Seguridad del stream

- **Al abrir:** cookie de sesión y comprobación en la base de datos de que el usuario existe y no está bloqueado (`blocked_at`). El JWT solo no basta.
- **Mientras está abierto:** en cada ping (cada 15 s) una consulta comprueba que todos los usuarios conectados siguen existiendo y no están bloqueados (`blocked_at`), y cierra los streams de los que no. Solo el Admin bloquea o borra cuentas. Opcional más adelante: que esas acciones del Admin llamen a `publish` para cerrarlo al instante.
- **Expulsiones:** cuando un Manager expulsa a alguien del club o del chat de un Event, su stream sigue abierto (sigue siendo usuario de la plataforma), pero deja de recibir eventos de ese club o chat porque los destinatarios se resuelven en la base de datos en cada entrega.
- **Logout:** el cliente cierra su propio stream. Con JWT sin tabla de sesiones, otras pestañas siguen con cookie válida hasta que expire.

### Estado online

- Dos estados: online u offline. Stream abierto = online.
- **Contador de conexiones por usuario** (varias pestañas): offline solo cuando llega a 0.
- **Ping `: ping` cada 15 s**; si la escritura falla, la conexión está muerta.
- Sin periodo de gracia por ahora (el estado puede parpadear al reconectar; se añade después si hace falta).

### Justificación de SSE ante el evaluador (README)

1. El subject dice "WebSockets **or similar**"; SSE es el estándar WHATWG para actualizaciones servidor → cliente.
2. El sentido cliente → servidor ya lo cubre HTTP (`POST`); un canal bidireccional no aporta nada en esta aplicación.
3. Cumple cada punto del subject: actualizaciones entre clientes, conexión y desconexión (`Last-Event-ID`, ping), broadcast eficiente (un listener, reparto en memoria).
4. Demo: dos navegadores, cortar la conexión y ver el reenvío.

### Pendiente del equipo

- **Quién ve el estado online.** La matriz de permisos no tiene fila para ello. Propuesta: solo Contacts aceptados (lo que pide el subject). Hay que añadirlo a la matriz (ticket 01) con confirmación del equipo.

Confirmado por el equipo: **no existe bloqueo entre usuarios**. Solo se puede enviar DM a un Contact aceptado; si alguien borra el Contact, dejan de poder escribirse y el stream deja de entregar esos DM.
