# Módulos elegidos

Subject: 14 puntos obligatorios (Major = 2, Minor = 1). El bonus cuenta como máximo 5 puntos extra sobre los 14, así que lo que pase de 19 no puntúa. Un módulo que no funcione en la evaluación vale 0.

## Major (14 pts)

| Módulo | Pts | Coste | Encaje | Comentario |
|---|---|---|---|---|
| Web: framework frontend + backend (Next.js) | 2 | Bajo | Alto | Full-stack con Next.js cuenta como ambos. |
| Real-time (SSE + Postgres LISTEN/NOTIFY) | 2 | Medio | Alto | Chat de Event, DM, notificaciones, reservas. Hay que manejar reconexión. Justificar SSE en el README (el subject dice "WebSockets o similar"). |
| User interaction (chat, perfil, amigos) | 2 | Medio | Alto | Chat por Event y DM entre Contacts; Club Profile; sistema de Contact con aceptación. |
| Standard user management | 2 | Medio | Alto | Registro, login, perfil editable, avatar por defecto, estado online de los Contacts. |
| Advanced permissions | 2 | Medio | Alto | Roles Admin, Manager y Athlete, CRUD de usuarios, vistas por rol. |
| Organization system | 2 | Medio | Alto | Varios clubes; crear, editar y borrar; añadir y quitar usuarios. |
| Advanced analytics dashboard | 2 | Medio-alto | Alto | Frecuencia, volumen semanal, RPE, Volume Alert. Gráficas interactivas, rango de fechas, exportación (CSV/PDF), datos en tiempo real. |

## Minor (7 pts)

| Módulo | Pts | Coste | Encaje | Comentario |
|---|---|---|---|---|
| ORM (Prisma) | 1 | Bajo | Alto | Ya en el stack. |
| Notification system | 1 | Medio | Alto | Ojo: el subject pide notificaciones para **todas** las acciones de creación, actualización y borrado, no solo reservas y Volume Alert. |
| GDPR compliance | 1 | Bajo-medio | Alto | Pedir datos, borrado con confirmación, exportación legible, emails de confirmación. Encaja con el Club Profile opt-in. |
| SSR | 1 | Casi nulo | Alto | Next.js App Router. Hay que poder demostrarlo y justificarlo. |
| 2FA (TOTP) | 1 | Bajo-medio | Medio | Librería más flujo de activación y recuperación. |
| File upload | 1 | Medio | Medio | Avatares, imágenes de Events, GPX. Validación cliente y servidor, vista previa, progreso, borrado, control de acceso. |
| OAuth 2.0 (42, Google, GitHub) | 1 | Bajo | Alto | NextAuth lo trae casi hecho. |

## Total

14 (Major) + 7 (Minor) = **21 puntos**. Cuentan como máximo 19, así que hay 2 puntos de margen por si algún módulo no se valida.

## Descartados por ahora

| Módulo | Pts | Motivo |
|---|---|---|
| Gamification (leaderboard, XP/nivel, badges) | 1 | Sustituida por SSR, 2FA, File upload y OAuth. Se puede recuperar si sobra capacidad; es la que más refuerza la idea de contacto presencial. |
| WCAG 2.1 AA completo | 2 | Coste alto y riesgo de quedar en 0. Se hace lo básico (semántica, contraste, teclado, etiquetas) porque el subject lo exige en la parte obligatoria. |
| i18n (3 idiomas) | 1 | Barato solo si se planifica desde el inicio. |
| Data export/import | 1 | Comparte trabajo con GDPR y el dashboard. Candidata de reserva. |
| Advanced search | 1 | Candidata de reserva para el calendario de Events. |
| PWA con offline | 1 | La de más valor para el producto (registrar sesión sin cobertura) pero coste medio. |
| Integraciones Strava / Google Health | — | Fuera de alcance; ampliación futura. |

## Fuera de alcance

Gaming (no hay juego), wearables, finanzas, inventario, IA y URLs de perfil realmente públicas.
