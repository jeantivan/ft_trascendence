# Esquema de base de datos

Type: grilling
Status: resolved
Blocked by: 01

## Question

¿Cuáles son las tablas y relaciones de PostgreSQL? Decisión ya tomada: columnas relacionales para Completion, RPE, distancia y tiempo, más una columna `extra` JSONB para métricas futuras. Hay que cerrar claves, relaciones (Group↔Athlete muchos a muchos, Plan como copia de Template, Spot Request, Contact con aceptación), qué se calcula (frecuencia semanal, volumen, Volume Alert) y qué se guarda, y qué consultas necesita el dashboard.

## Answer

PostgreSQL con Prisma. Ids de entidades en `uuid`; `bigserial` solo donde hace falta orden para reenviar por SSE (`messages`, `notifications`). Fechas en `timestamptz` (UTC). Distancia en metros y duración en segundos, enteros; el ritmo se calcula, no se guarda.

### Regla sobre JSONB (decidida, no se reabre en cada PR)

Las métricas core van en columnas. `extra` (JSONB) es solo para métricas opcionales, validadas con Zod al escribir. Si una clave de `extra` se consulta a menudo, se promueve a columna.

### Tablas

**Identidad y 2FA**
- `users`: id, email (único), password_hash (nulo si solo OAuth), nick, avatar_url, role_global (`admin` | `user`), blocked_at, totp_secret (cifrado, nulo), totp_enabled, email_2fa_enabled, stats_public (opt-in del Club Profile, por defecto falso), created_at.
- `accounts`: proveedor OAuth (google, github, 42) con `user_id`, `provider`, `provider_account_id`. Sin tabla de sesiones: sesiones JWT; las acciones sensibles recomprueban rol y estado en base de datos.
- `email_otp_codes`: user_id, code_hash, expires_at, attempts, consumed_at.
- `recovery_codes`: user_id, code_hash, used_at.

**Club y pertenencia**
- `organizations`: id, name, description, timezone, created_at.
- `memberships`: user_id, org_id, role (`manager` | `athlete`), joined_at. Único (user_id, org_id). Se garantiza en servidor que cada club conserve al menos un Manager.
- `membership_requests`: id, org_id, user_id, kind (`invite` | `request`), status (`pending` | `accepted` | `rejected` | `revoked`), created_by.
- `groups`: id, org_id, name, level, objective (maratón, carrera corta, media distancia, marcha...).
- `group_members`: group_id, user_id. Un Athlete puede estar en varios Groups.

**Entrenamiento**
- `training_templates`: id, org_id, name, created_by.
- `template_sessions`: template_id, position, session_type, target_distance_m, target_pace_s_per_km, target_duration_s, day_offset.
- `sessions` (prescripción): id, org_id, origin (`template` | `customized` | `free`), session_type (`rodaje` | `intervalos` | `cuestas` | `tirada_larga` | `fartlek`), target_distance_m, target_pace_s_per_km, target_duration_s, scheduled_at, group_id (nulo si es individual), athlete_id (dueño, nulo si es de grupo), source_template_id (solo trazabilidad), customizes_session_id (apunta a la sesión de grupo que modifica).
- `session_logs` (resultado por Athlete): id, session_id, athlete_id, completed (boolean), rpe (1-10), distance_m (nulo), duration_s (nulo), performed_at, extra (JSONB, validado con Zod). Único (session_id, athlete_id).
- No hay tabla `plans`. Asignar una plantilla a un Group con una fecha de inicio crea las `sessions` de grupo como copias. Una Customized Session es una copia por Athlete con `customizes_session_id`. Una Free Session es una fila de `sessions` con origin `free` y `athlete_id`, más su `session_log`.

**Events y Feedback**
- `events`: id, org_id, title, location, starts_at, session_id (opcional), created_by, cancelled_at.
- `spot_requests`: event_id, user_id, status (`pending` | `approved` | `rejected` | `withdrawn`). Único (event_id, user_id).
- `feedback`: id, event_id, athlete_id, manager_id, body. **Solo existe para Events con sesión**: sin `session_id` no hay Feedback.

**Social y tiempo real**
- `contacts`: user_a, user_b, status (`pending` | `accepted`), requested_by. Solo se puede solicitar entre miembros de un Group compartido.
- `conversations`: id, kind (`event` | `dm`), event_id (opcional). Los DM son una conversación única por pareja de Contacts.
- `conversation_participants`: conversation_id, user_id, removed_at.
- `messages`: id `bigserial`, conversation_id, author_id (nulo si la cuenta se borró), body, created_at, deleted_at.
- `notifications`: id `bigserial`, user_id, type, payload (JSONB), read_at, created_at. El id se usa como `Last-Event-ID`.

### Derivados (no se guardan como columnas)

Frecuencia semanal, volumen semanal, RPE medio y ritmo se calculan por consulta sobre `session_logs`, agrupando por semana (lunes) en la zona horaria del club (`organizations.timezone`), con índice en (athlete_id, performed_at). El Volume Alert se evalúa al guardar un log y se emite como `notification`.

### Borrado (GDPR)

Borrado real de datos personales del usuario: sesiones, logs, DM, Contacts y Feedback recibido. Los mensajes en chats de Events se conservan con `author_id` nulo (autor anónimo) para no romper conversaciones de otros.
