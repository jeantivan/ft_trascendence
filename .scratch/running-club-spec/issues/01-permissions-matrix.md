# Matriz de permisos

Type: grilling
Status: resolved

## Question

¿Qué puede ver, crear, editar y borrar cada rol (Admin, Manager, Athlete) sobre cada entidad (Organization, Group, Training Template, Session, Event, Spot Request, Feedback, Club Profile, Contact, mensajes)? Incluye qué ve un usuario que no es miembro del club y qué ve cada Manager de un club distinto. Debe cubrir el módulo Advanced permissions (CRUD de usuarios, roles, vistas por rol) y el Organization system.

## Answer

Roles: **Admin** (global, plataforma), **Manager** y **Athlete** (por membresía de club; una persona puede ser Athlete en un club y Manager en otro), y **usuario sin club** (registrado, aún sin membresía). C/R/U/D = crear/leer/editar/borrar. "—" = sin acceso. Todo se aplica en el servidor (403 si no procede), no solo en la interfaz.

| Entidad | Admin | Manager (de su club) | Athlete (miembro) | Usuario sin club |
|---|---|---|---|---|
| Cuenta de usuario | CRUD de todas, bloquear | R de miembros de su club | CRU/D de la propia | CRU/D de la propia |
| Organization (club) | CRUD | R, U descripción | R | R solo lista (nombre, descripción, nº de miembros) |
| Rol de Manager | asignar y retirar (siempre ≥1 Manager por club) | — | — | — |
| Invitación de entrada | — | C, revocar | aceptar la suya | aceptar la suya |
| Solicitud de entrada | — | R, aprobar/rechazar | — | C, retirar la suya |
| Expulsar miembro | sí | sí | salirse él mismo | — |
| Group | R, D | CRUD, asignar y quitar Athletes | R sus Groups | — |
| Training Template | — | CRUD (las de su club) | R las asignadas (copia) | — |
| Plan / Template Session | — | CRUD sobre sesiones no completadas | R las suyas | — |
| Customized Session | — | CRUD sobre sesiones no completadas | R las suyas | — |
| Free Session | — | R (de sus Athletes) | CRUD las propias | — |
| Session Metrics (Completion, RPE, distancia, tiempo) | — | R de todos los Athletes del club | CRUD las propias, siempre | — |
| Event | R, D | CRUD | R todos los del club | — |
| Spot Request | — | R, aprobar/rechazar | C, retirar la suya, R la suya | — |
| Chat del Event | borrar contenido denunciado | R, escribir, borrar mensajes, expulsar | R y escribir solo si admitido | — |
| Feedback | — | C, U, D los que haya dado | R los suyos | — |
| Club Profile | — | R | U el propio (opt-in); R el de otros miembros del club | — |
| Contact | — | CRUD sobre los suyos (como persona) | solicitar a miembros de un Group compartido; aceptar, rechazar, borrar | — |
| DM entre Contacts | **sin acceso** | solo los suyos | solo los suyos | — |
| Notification | — | R las propias | R las propias | R las propias |

### Reglas transversales

- **Nadie fuera del club** ve Groups, Events, Sessions ni perfiles, salvo la excepción de la lista de clubes (nombre, descripción, nº de miembros).
- **El número de apuntados** a un Event lo ve cualquier miembro del club; los nombres, solo los Managers.
- **RPE y Feedback:** los ve el propio Athlete y los Managers del club. Nadie más. El Admin no lee RPE ni DM.
- **Cambios del Manager** nunca reescriben una sesión ya completada. Si el Athlete corrige sus métricas, el Feedback ya dado se conserva.
- **El Admin** gestiona cuentas, clubes y contenido denunciado; no es un rol de acceso a datos personales.
- Un Athlete solo ve datos de otro miembro a través del Club Profile (nick y foto siempre; estadísticas agregadas con opt-in).
- El Athlete que entra a un club pasa a Athlete en esa membresía. El usuario sin club no puede crear Free Sessions ni tener Contacts.
- La Privacy Policy debe decir que el Manager ve las métricas, incluido el RPE y las Free Sessions, de sus Athletes.
