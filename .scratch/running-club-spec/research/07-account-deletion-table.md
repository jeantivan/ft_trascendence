# Tabla de borrado de cuenta (GDPR Art. 17)

Ticket: GitHub #8 (`issues/07-privacy-tos-gdpr.md`). Insumo para #19 (`schema.prisma`): qué hace cada FK a `users` cuando se borra una cuenta.

Estado: **borrador, pendiente de revisión del equipo**. No cambia la spec; solo la ordena por tabla.

Fuentes: spec final de #8 (último comentario, "Solicitar Borrado de Cuenta", "Mensajes en Events tras Borrado", "Mensajes Privados (DM) tras Borrado", "Auditoría") y esquema de #3 (`issues/02-database-schema.md`).

## Leyenda

| Marca | Significado |
|---|---|
| **Spec** | Lo dice literalmente la spec de #8 |
| **Derivado** | No está escrito, pero es consecuencia directa de una regla de la spec. Confirmar |
| **Sin definir** | La spec no lo cubre. No se inventa: hay que decidirlo |

## Tabla

| Tabla / dato | Qué pasa al borrar la cuenta | Origen | `onDelete` sugerido |
|---|---|---|---|
| `users` | Se borra la fila (perfil) de inmediato | Spec | n/a (es la raíz) |
| `accounts` (OAuth) | Se borran las filas del usuario | Derivado | Cascade |
| `email_otp_codes`, `recovery_codes` | Se borran | Derivado | Cascade |
| `memberships` | Se borran las filas del usuario | Derivado | Cascade |
| `group_members` | Se borran las filas del usuario | Derivado | Cascade |
| `sessions` con `athlete_id` = usuario (libres y customizadas) | Se borran | Spec ("Sessions") | Cascade |
| `sessions` de grupo (`athlete_id` nulo) | **No** se borran: son del club y otros Athletes tienen `session_logs` sobre ellas | Derivado | n/a |
| `session_logs` del usuario | Se borran | Spec | Cascade |
| `feedback` recibido (`athlete_id` = usuario) | Se borra | Spec | Cascade |
| `contacts` (cualquiera de las dos puntas) | Se borran | Spec | Cascade |
| `messages` en DM | Se conservan con `author_id = null` para el otro Contact | Spec | SetNull |
| `messages` en chats de Event | Se conservan con `author_id = null` | Spec | SetNull |
| `conversation_participants` del usuario | Se borra la fila (o `removed_at`); la conversación DM sigue para el otro Contact | Derivado | Cascade |
| `spot_requests` del usuario | Se borran | Derivado | Cascade |
| `notifications` del usuario | Se borran | Derivado | Cascade |
| `audit_log` (`actor_id`, `subject_id`) | **Sin definir** (ver P1) | Sin definir | pendiente |
| `feedback` escrito (`manager_id` = usuario) | **Sin definir** (ver P2) | Sin definir | pendiente |
| `events.created_by` | **Sin definir** (ver P3) | Sin definir | pendiente |
| `training_templates.created_by` | **Sin definir** (ver P3) | Sin definir | pendiente |
| `membership_requests.created_by` y `user_id` | **Sin definir** (ver P3) | Sin definir | pendiente |
| Último Manager de un club | **Sin definir** (ver P4) | Sin definir | n/a (regla de servidor) |
| Archivo de avatar en el volumen (`avatar_url`) | Hay que borrar el archivo del disco, no solo la fila | Derivado | n/a (acción de servidor) |
| ZIP de exportación GDPR pendiente | Hay que borrarlo | Derivado | n/a (acción de servidor) |
| Logs técnicos (IP, navegador, accesos) | No se borran al momento; máximo 3 meses después | Spec | n/a |

## Lo que implica para el esquema (#19)

- `messages.author_id` debe ser **nullable** con `SetNull`.
- Las FK de datos personales del usuario (`session_logs`, `sessions` individuales, `contacts`, `feedback` recibido, `spot_requests`, `notifications`, `memberships`, `group_members`, `accounts`, códigos OTP/recovery) son `Cascade`.
- Las FK donde el usuario es **autor de contenido del club** (`events.created_by`, `training_templates.created_by`, `feedback.manager_id`, `membership_requests.created_by`) y `audit_log` **no pueden quedarse con el `onDelete` por defecto de Prisma**: hay que decidirlo antes de cerrar el esquema (P1 a P3).
- El borrado es una **transacción de servidor** con sus pasos fuera de la BD (borrar archivo de avatar y ZIPs). `onDelete` solo no basta.

## Contradicción a corregir en la documentación

- #3 (`02-database-schema.md`, sección "Borrado") dice que los **DM se borran** realmente. La spec final de #8 dice que se **conservan con `author_id = null`** para el otro Contact. Manda #8, que es posterior y aprobada. Hay que actualizar #3 para que Rebeca no implemente lo antiguo.

## Preguntas abiertas (decisión del equipo, no se inventan)

**P1. `audit_log` y cuenta borrada.** La spec fija "datos técnicos 3 meses", pero no dice qué pasa con las filas de auditoría cuyo `actor_id` o `subject_id` es el usuario borrado. Opciones: `SetNull` y conservar; borrar las filas donde es `subject_id`; o conservar con retención de 3 meses. Importa para el esquema porque cambia si es FK real.

**P2. Feedback escrito por un Manager que borra su cuenta.** El Athlete receptor sigue necesitando ver su Feedback. ¿Se conserva con `manager_id = null`, o se borra?

**P3. Contenido del club creado por quien se va** (Events, plantillas, solicitudes). Es contenido del club y otros dependen de él. Propuesta a discutir: conservar con `created_by = null`. No está decidido.

**P4. Último Manager.** El esquema dice que un club conserva siempre al menos un Manager. ¿Borrar la cuenta del último Manager se bloquea hasta nombrar otro?

**P5. Sesiones de grupo del usuario.** He interpretado "Sessions" de la spec como las sesiones individuales del usuario (`athlete_id`). Confirmar que las sesiones de grupo no se tocan.

## Nota legal (para ti)

La spec ya reconoce que `author_id = null` es **desvinculación técnica, no anonimización**: el texto del mensaje puede seguir identificando al autor. Con la regla de Art. 17 y el interés del otro Contact, la Privacy Policy debe decirlo con claridad (ya lo recoge en "Retención de datos"). Si la jurisdicción exige anonimización real, habría que reabrir esta regla; la spec deja la jurisdicción como pendiente.
