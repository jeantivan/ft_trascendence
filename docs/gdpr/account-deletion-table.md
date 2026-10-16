# Tabla de borrado de cuenta (GDPR Art. 17)

Ticket: GitHub #8, sub-issue #29. Insumo para #19 (`schema.prisma`): qué hace cada FK a `users` cuando se borra una cuenta.

Estado: **decidido por Marta (responsable de #8); pendiente de que el equipo lo vea en el PR**. Las filas "Decidido" resuelven las preguntas P1 a P5 del borrador anterior.

Fuentes: spec final de #8 (último comentario, "Solicitar Borrado de Cuenta", "Mensajes en Events tras Borrado", "Mensajes Privados (DM) tras Borrado", "Auditoría") y esquema de #3.

## Leyenda

| Marca | Significado |
|---|---|
| **Spec** | Lo dice literalmente la spec de #8 |
| **Derivado** | No está escrito, pero es consecuencia directa de una regla de la spec. Confirmar |
| **Decidido** | No estaba en la spec; lo ha decidido la responsable de #8 |

## Tabla

| Tabla / dato | Qué pasa al borrar la cuenta | Origen | `onDelete` |
|---|---|---|---|
| `users` | Se borra la fila (perfil) de inmediato | Spec | n/a (es la raíz) |
| `accounts` (OAuth) | Se borran las filas del usuario | Derivado | Cascade |
| `email_otp_codes`, `recovery_codes` | Se borran | Derivado | Cascade |
| `memberships` | Se borran las filas del usuario | Derivado | Cascade |
| `group_members` | Se borran las filas del usuario | Derivado | Cascade |
| `sessions` con `athlete_id` = usuario (libres y customizadas) | Se borran | Spec ("Sessions") | Cascade |
| `sessions` de grupo (`athlete_id` nulo) | **No** se borran: son del club y otros Athletes tienen `session_logs` sobre ellas | Decidido | n/a |
| `session_logs` del usuario | Se borran | Spec | Cascade |
| `feedback` recibido (`athlete_id` = usuario) | Se borra | Spec | Cascade |
| `feedback` escrito (`manager_id` = usuario) | **Se conserva** en el Athlete receptor con `manager_id = null` | Decidido | SetNull |
| `contacts` (cualquiera de las dos puntas) | Se borran | Spec | Cascade |
| `messages` en DM | Se conservan con `author_id = null` para el otro Contact | Spec | SetNull |
| `messages` en chats de Event | Se conservan con `author_id = null` | Spec | SetNull |
| `conversation_participants` del usuario | Se borra la fila (o `removed_at`); la conversación DM sigue para el otro Contact | Derivado | Cascade |
| `spot_requests` del usuario | Se borran | Derivado | Cascade |
| `notifications` del usuario | Se borran | Derivado | Cascade |
| `events.created_by` | El Event **se conserva**, con `created_by = null` | Decidido | SetNull |
| `training_templates.created_by` | La plantilla **se conserva**, con `created_by = null` | Decidido | SetNull |
| `membership_requests.created_by` (invitación hecha por el usuario) | La solicitud se conserva, con `created_by = null` | Decidido | SetNull |
| `membership_requests.user_id` (solicitud del propio usuario) | Se borran | Derivado | Cascade |
| `audit_log` (`actor_id`, `subject_id`) | **Se conserva el registro** de quién miró datos de quién | Decidido | Sin FK real, ver nota |
| Archivo de avatar en el volumen (`avatar_url`) | Hay que borrar el archivo del disco, no solo la fila | Derivado | n/a (acción de servidor) |
| ZIP de exportación GDPR pendiente | Hay que borrarlo | Derivado | n/a (acción de servidor) |
| Logs técnicos (IP, navegador, accesos) | No se borran al momento; máximo 3 meses después | Spec | n/a |

## Regla del último Manager

**Decidido (revisado tras la revisión legal externa):** el borrado de cuenta de un Manager **no se bloquea** aunque sea el único de un club. Un bloqueo indefinido compromete el derecho de supresión (art. 17 RGPD).

- Al borrar la cuenta de un Manager que es el único de un club, el club queda sin Manager y **se avisa al Admin**, que asume la gestión o nombra a un sustituto (el Admin es quien da el rol de Manager).
- Aplica si es el único Manager de **cualquiera** de sus clubes.
- El aviso al Admin se genera en la misma transacción del borrado.
- Mientras el club no tiene Manager, el Admin gestiona el club.

## Lo que implica para el esquema (#19)

- Nullable con `SetNull`: `messages.author_id`, `feedback.manager_id`, `events.created_by`, `training_templates.created_by`, `membership_requests.created_by`.
- `Cascade` desde `users` en los datos personales del usuario (filas marcadas Cascade en la tabla).
- **`audit_log`**: para que el registro sobreviva al borrado, `actor_id` y `subject_id` no pueden ser FK con `Cascade`. Dos opciones, a elegir por Rebeca: columnas `uuid` **sin FK** (conservan el id), o FK con `SetNull` (pierde quién era). Con la decisión "se conserva el registro", la primera opción es la que lo cumple.
- El borrado es una **transacción de servidor** con pasos fuera de la BD (borrar archivo de avatar y ZIPs) y el aviso al Admin cuando el club se queda sin Manager. `onDelete` solo no basta.

## Contradicción a corregir en la documentación

- #3 (sección "Borrado") dice que los **DM se borran** realmente. La spec final de #8 dice que se **conservan con `author_id = null`** para el otro Contact. Manda #8, que es posterior y aprobada. Hay que actualizar #3 para que Rebeca no implemente lo antiguo.

## Pendiente (menor)

- **Retención del `audit_log`.** Se conserva, pero la spec solo fija 3 meses para los logs técnicos. ¿El registro de auditoría tiene plazo o es indefinido? Con la cuenta ya borrada, el registro sigue siendo dato personal pseudonimizado (ids), así que conviene fijarlo y reflejarlo en la Privacy Policy.
- **Feedback sin autor.** Si el Manager se va, el Athlete verá el Feedback sin nombre. El texto de la interfaz ("Entrenador anterior" o similar) es decisión de UI.

## Nota legal

La spec ya reconoce que `author_id = null` es **desvinculación técnica, no anonimización**: el texto del mensaje puede seguir identificando al autor. La Privacy Policy debe decirlo con claridad (ya lo recoge en "Retención de datos"). Si la jurisdicción exige anonimización real, habría que reabrir esta regla; la spec deja la jurisdicción como pendiente.
