# Mapa: Spec del club de running

Label: wayfinder:map

## Destination

Spec listo para pasar a tickets de construcción: modelo de dominio (`CONTEXT.md`), matriz de permisos, esquema de base de datos, arquitectura de tiempo real, infraestructura y autenticación, páginas legales y GDPR, lista final de módulos (`ideas/modulos.md`) y reparto entre las 4 personas.

## Notes

- Proyecto ft_transcendence (42): plataforma web para clubes de running. Equipo: jtivan-r (PO), jmateo-v (PM), rebgarci (Tech Lead), mvigara- (Dev).
- Vocabulario canónico en `CONTEXT.md`; leerlo antes de cualquier ticket. Elegidos y descartados en `ideas/modulos.md`. El material de fútbol/Omnisport en `ideas/` y `README.md` está superado.
- Skills a consultar: grilling, domain-modeling.
- Decisiones de partida: multi-club; roles Admin, Manager, Athlete; SSE (no WebSocket); métricas relacionales más `extra` JSONB; Contact con aceptación; Event = Session de grupo con chat y reservas aprobadas por el Manager; Feedback privado en la ficha del Event.

## Decisions so far

<!-- una línea por ticket cerrado: [título](issues/NN-slug.md): gist -->

- [Criterios de aceptación de los módulos](issues/03-module-acceptance-criteria.md): checklist hecho; SSE aceptado como "similar"; Notification con mecanismo central y test de mutaciones; OAuth con Google, GitHub y 42; 2FA con código por email más TOTP, no exigido a OAuth.
- [Matriz de permisos](issues/01-permissions-matrix.md): roles Admin (global) más Manager y Athlete por club; solo el Admin crea clubes y da el rol de Manager; entrada por invitación o solicitud aprobada por Manager; Manager ve todas las métricas de su club; Admin no lee DM ni RPE; permisos aplicados en servidor.
- [Esquema de base de datos](issues/02-database-schema.md): PostgreSQL con Prisma; `sessions` (prescripción) y `session_logs` (resultado) separadas; sin tabla de planes; Event con sesión opcional y Feedback solo si hay sesión; chat y notificaciones con id `bigserial`; métricas core en columnas y `extra` JSONB solo para opcionales validadas con Zod; borrado GDPR real con mensajes de Events anónimos.
- [Reparto de módulos y roles](issues/08-module-and-role-assignment.md): rebgarci ORM, SSR, permisos y File upload más base técnica (5 pts); jtivan-r identidad, OAuth, 2FA y núcleo de entrenamiento (4); mvigara- Web, Organization, dashboard, GDPR y legales (7); jmateo-v Real-time, User interaction y Notification (5).
- [Infra y autenticación](issues/06-infra-and-auth.md): pila viable (Next.js, Auth.js v5 con JWT, SSE tras NGINX, Docker Compose con HTTPS autofirmado, archivos en volumen local); correo con Mailpit más Brevo.
- [Prototipo: registro de sesión y dashboard](issues/04-session-logging-and-dashboard-prototype.md): prototipo HTML interactivo validado; registro de sesiones prescritas (precargadas) vs libres; sesiones completadas, interrumpidas (con motivo en `extra` JSONB) y no realizadas; escala RPE Borg 1-10 descriptiva; dashboard semanal con KPI, Volume Alert (+10%) y evolución a 6 semanas.

## Not yet specified

- Catálogo de disparadores de notificaciones (el subject pide notificar toda creación, actualización y borrado).
- Gráficas, filtros y exportación del dashboard analítico.
- Calendario de Events: vistas y filtros.
- Estructura del README y checklist de la evaluación.

## Out of scope

- Integraciones con Strava y Google Health, wearables.
- Gamificación (descartada para este plan; recuperable si sobra capacidad).
- Accesibilidad WCAG 2.1 AA completa (solo lo básico).
- Finanzas, inventario, IA y URLs de perfil realmente públicas.
