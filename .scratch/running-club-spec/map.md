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
- [Infra y autenticación](issues/06-infra-and-auth.md): pila viable (Next.js, Auth.js v5 con JWT, SSE tras NGINX, Docker Compose con HTTPS autofirmado, archivos en volumen local); correo con Mailpit más Brevo.

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
