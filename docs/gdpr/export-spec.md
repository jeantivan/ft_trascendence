# Especificación de exportación de datos (RGPD art. 15 y 20)

> Sub-issue #28, parte de #8. Sustituye a la Parte 7 de #8, que incluía datos de terceros. Los nombres de campo son los del esquema Prisma de #19 (PR #31). La implementación va en #25.

## 1. Flujo

1. El usuario pulsa **Ajustes > Privacidad > Descargar mis datos**.
2. **Reautenticación:** el servidor envía un código OTP por email, el mismo mecanismo que el borrado de cuenta (caduca en 10 minutos, 5 intentos).
3. Con el OTP correcto se crea la exportación. **Solo puede haber una activa por usuario**: si ya existe una no caducada, se rechaza la petición con ese motivo.
4. El ZIP se genera en el servidor y se guarda con un nombre no adivinable.
5. El servidor envía un email con el enlace de descarga. El email **no contiene datos**, solo el enlace y la fecha de caducidad.
6. El enlace caduca a los **7 días**. Al caducar se borra el ZIP y el registro de la exportación.
7. Si el usuario borra su cuenta, se borran el ZIP pendiente y el registro de la exportación.

Plazo de respuesta (Privacy Policy, sección 9): sin dilación indebida y como máximo un mes. La exportación automática cubre ese plazo; las peticiones de datos que la descarga no incluya se atienden por email.

## 2. Endpoints

Todas las acciones comprueban en el servidor que hay sesión y que el usuario existe y no está bloqueado. No basta el rol del JWT ni `proxy.ts`.

### `POST /api/gdpr/export/otp`

Envía el OTP al email del usuario. Sin cuerpo. Responde `204`.

### `POST /api/gdpr/export`

```json
{ "otp": "123456" }
```

| Código | Cuándo |
|---|---|
| `202` | Exportación creada. Cuerpo: `{ "export_id": "uuid", "status": "pending" }` |
| `401` | Sin sesión |
| `403` | OTP incorrecto, caducado o con los 5 intentos agotados |
| `409` | Ya existe una exportación activa |

### `GET /api/gdpr/export/{export_id}`

Comprueba que el `export_id` pertenece al usuario de la sesión (`404` si no).

- Estado `pending` o `failed`: responde `{ "status": "...", "expires_at": null }`.
- Estado `ready`: responde `{ "status": "ready", "expires_at": "..." }`.

### `GET /api/gdpr/export/{export_id}/download`

Requiere sesión iniciada del **mismo usuario** además del token del enlace. Devuelve el ZIP (`application/zip`). Responde `404` si caducó o no es suyo.

Los logs y errores de estas rutas llevan solo `export_id`, nunca el contenido del ZIP.

## 3. Contenido del ZIP

```
export.zip
├── data.json
├── sessions.csv
├── session_logs.csv
├── messages.csv
└── README.txt
```

Convenciones:
- **Fechas:** ISO 8601 en UTC (`2026-10-01T07:00:00Z`).
- **CSV:** UTF-8, separador coma, cabecera en la primera fila, comillas dobles según RFC 4180. Valor ausente = celda vacía.
- **Inyección de fórmulas:** si el valor de una celda de texto empieza por `=`, `+`, `-`, `@`, tabulador o retorno de carro, se antepone una comilla simple `'`. Se aplica a todos los campos de texto libre.
- **JSON:** `null` para valores ausentes. Claves en `snake_case`, igual que las columnas de la base de datos.

### 3.1 `data.json`

```json
{
  "exported_at": "2026-10-06T11:28:00Z",
  "profile": {
    "id": "uuid",
    "email": "athlete@example.com",
    "nick": "runner42",
    "image": "https://...",
    "created_at": "2026-01-01T00:00:00Z",
    "login_methods": ["password", "google"],
    "totp_enabled": false,
    "email_2fa_enabled": true
  },
  "settings": {
    "stats_public": false,
    "notifications_enabled": true,
    "show_online": true
  },
  "consents": {
    "health_consent_at": "2026-02-01T10:00:00Z",
    "health_consent_version": "[FORMATO DE VERSIÓN: pendiente de decidir]"
  },
  "memberships": [
    { "org_id": "uuid", "org_name": "Club Running Madrid", "role": "athlete", "joined_at": "2026-01-15T00:00:00Z" }
  ],
  "groups": [
    { "group_id": "uuid", "org_id": "uuid", "name": "Grupo maratón", "level": "intermedio", "objective": "maratón" }
  ],
  "events": [
    { "event_id": "uuid", "org_id": "uuid", "title": "Rodaje grupal", "location": "Retiro", "starts_at": "2026-10-05T08:00:00Z", "your_status": "approved", "requested_at": "2026-10-01T09:00:00Z" }
  ],
  "feedback_received": [
    { "id": "uuid", "event_id": "uuid", "body": "Buen ritmo hoy", "created_at": "2026-10-05T09:00:00Z" }
  ],
  "contacts": [
    { "status": "accepted", "requested_by_you": true, "created_at": "2026-03-01T00:00:00Z" }
  ],
  "notifications": [
    { "id": "123", "type": "spot_approved", "read_at": null, "created_at": "2026-10-01T09:05:00Z" }
  ],
  "access_log": [
    { "created_at": "2026-10-05T09:10:00Z", "action": "read", "resource": "session_log", "actor_role": "manager" }
  ]
}
```

| Bloque | Origen | Notas |
|---|---|---|
| `profile` | `users` | `login_methods` sale de `accounts.provider` y de si hay `password_hash`. **No** se exportan `password_hash`, `totp_secret` ni tokens de `accounts` |
| `settings` | `users` | |
| `consents` | `users` | `health_consent_version` depende del campo que cree #19 |
| `memberships` | `memberships` + `organizations.name` | Solo los clubes del usuario |
| `groups` | `group_members` + `groups` | Solo los grupos del usuario |
| `events` | `spot_requests` + `events` | Solo los Events a los que el usuario pidió plaza |
| `feedback_received` | `feedback` donde `athlete_id` = usuario | **Sin** `manager_id` ni nombre del Manager. El usuario sabe que lo escribió un Manager de ese Event |
| `contacts` | `contacts` donde el usuario es `user_a` o `user_b` | **Sin** id, nick ni email del otro. Solo estado, quién lo pidió y fecha |
| `notifications` | `notifications` del usuario | Sin `payload` (solo ids, y no aportan nada al usuario) |
| `access_log` | `audit_log` donde `subject_id` = usuario | Fecha, acción, recurso y **rol** del actor (`manager` o `admin`). **Sin** `actor_id` |

El `access_log` cubre el derecho a saber quién ha accedido a tus datos (art. 15.1.c). Solo existe 12 meses (Privacy Policy, sección 7).

### 3.2 `sessions.csv`

Sesiones individuales del usuario (`athlete_id` = usuario) y sesiones de grupo de los grupos a los que pertenece.

```
session_id,org_id,origin,session_type,target_distance_m,target_pace_s_per_km,target_duration_s,scheduled_at,group_id,customizes_session_id
uuid-1,uuid-org,template,rodaje,10000,360,3600,2026-10-01T07:00:00Z,uuid-group,
uuid-2,uuid-org,free,intervalos,8000,,1800,2026-10-02T18:00:00Z,,
```

### 3.3 `session_logs.csv`

```
session_id,completed,rpe,distance_m,duration_s,performed_at,incompletion_reason
uuid-1,true,7,10200,3600,2026-10-01T07:30:00Z,
uuid-2,false,5,,600,2026-10-02T18:15:00Z,time_constraints
```

`incompletion_reason` sale de `session_logs.extra`. Es el único campo que lleva `extra` (enum cerrado, sin texto libre).

### 3.4 `messages.csv`

Solo los mensajes **escritos por el usuario** (`author_id` = usuario), en chats de Events y en mensajes privados.

```
message_id,conversation_id,kind,body,created_at,deleted_at
101,uuid-conv,event,"Llego en 5 minutos",2026-10-05T07:55:00Z,
102,uuid-dm,dm,"¿Quedamos antes?",2026-10-06T10:00:00Z,
```

No se incluyen los mensajes de otras personas ni sus nombres. `kind` es `event` o `dm`. Los mensajes borrados por el usuario se incluyen mientras sigan conservados en la base de datos, identificados con `deleted_at`; el `README.txt` lo explica.

### 3.5 `README.txt`

```
DATOS EXPORTADOS DE [NOMBRE DE LA PLATAFORMA]
Fecha: 2026-10-06 11:28 UTC
Usuario: athlete@example.com

CONTENIDO:
- data.json: perfil, ajustes, consentimientos, clubes, grupos, eventos,
  feedback recibido, contactos, notificaciones y registro de accesos
- sessions.csv: sesiones (tipo, objetivo)
- session_logs.csv: resultados (completada, RPE, distancia, duración)
- messages.csv: los mensajes que escribiste (los que borraste
  aparecen con la fecha de borrado si aún los conservamos)

CAMPOS:
- distance_m: distancia en metros
- duration_s: duración en segundos
- rpe: escala 1-10 (percepción de esfuerzo)
- incompletion_reason: motivo si no se completó
  - time_constraints: falta de tiempo
  - schedule_conflict: conflicto de horario
  - route_unavailable: ruta no disponible
  - equipment_issue: problema de equipamiento
  - other: otro

ZONA HORARIA: UTC

NO SE INCLUYE:
- Contraseñas, credenciales OAuth ni secretos de autenticación (TOTP)
- Datos de otras personas: mensajes ajenos, nombres de contactos
  o de Managers
- Datos que escribiste como Manager sobre otras personas
  (Feedback, Events, plantillas)

Si necesitas más datos de los que incluye la descarga, escribe a
[EMAIL DE CONTACTO].
```

## 4. Qué NO se exporta

| Dato | Motivo |
|---|---|
| `password_hash`, `totp_secret`, `recovery_codes`, `email_otp_codes`, tokens de `accounts` | Secretos de autenticación |
| Mensajes de otras personas, nick/email/id de tus contactos y del Manager que escribió tu Feedback | Datos de terceros |
| Feedback que escribiste como Manager | Habla de otra persona y contiene sus datos de salud |
| Events, plantillas e invitaciones que creaste como Manager | No son datos sobre ti; los usan otros Athletes |
| `actor_id` del registro de accesos | Dato del Manager o del Admin |
| `payload` de `notifications` | Minimización y protección de terceros: se exporta solo el tipo, la fecha y si se leyó |

## 5. Salud y registros

- RPE y Feedback aparecen solo en el ZIP del propio usuario. El email de aviso no contiene ninguno.
- Los eventos SSE o notificaciones de la exportación llevan solo `export_id`.
- La exportación de datos propios **no** se registra en `audit_log` (no es un acceso de un tercero a datos sensibles).

## 6. Decisiones abiertas

Cerradas: `notifications` se exporta sin `payload`; los mensajes borrados por el usuario se incluyen con `deleted_at`; la descarga exige token válido **y** sesión iniciada del mismo usuario (requisito, no opción).

| Tema | Propuesta | Quién decide |
|---|---|---|
| Dónde se guarda el ZIP (disco del servidor, volumen Docker, almacenamiento externo) | Resolver en #25 | Equipo |
| Formato de `health_consent_version` | Resolver en #19 | Equipo |
| Límite de peticiones por día | Una exportación activa a la vez (sección 1) | Equipo |
