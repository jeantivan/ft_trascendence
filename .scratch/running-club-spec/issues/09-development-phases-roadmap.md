# Hoja de ruta y etapas de desarrollo (Fases 1 a 4)

Type: task
Status: open
Assignee: jtivan-r
GitHub: #17

## Question

¿Cuáles son las etapas de desarrollo para que el equipo de 5 personas pueda avanzar en paralelo sin bloqueos tras cerrar el esquema de base de datos y la arquitectura de tiempo real?

## Answer

Propuesta publicada y actualizada en GitHub issue #17.

### Principios de coordinación
1. **Tipos TypeScript y Zod primero (Contratos de Datos):** definidos al inicio de cada fase para desacoplar frontend y backend.
2. **Cero push directo a `main`:** una rama por ticket (`feat/`, `fix/`, `docs/`, `chore/`) y PR pequeño revisado.
3. **Seguridad y permisos en servidor:** comprobar rol y membresía en BD en cada acción sensible (nunca solo JWT).
4. **Datos de salud protegidos:** RPE y Feedback nunca en logs, SSE ni notificaciones; cliente pide dato a endpoint con permisos.

### Fases
- **Fase 1: Cimientos Compartidos y Contratos Base:**
  - `rebgarci`: `schema.prisma` completo (#3) + migración inicial + `seed.ts` demo.
  - `jtivan-r`: Auth.js v5 con JWT, Credentials y helper `auth()`.
  - `mvigara-`: Shell web con Tailwind, layout, barra superior, sidebar con rutas base y layout legal.
  - `jmateo-v`: Endpoint SSE `/api/events`, helper `publish` con `pg_notify` y listener en Node.
  - `Furiosso`: Base de File upload (almacenamiento en volumen Docker `/data/uploads`, multipart y validación MIME) + generador de datos simulados de `session_logs` (6 semanas con RPE) para `seed.ts`.
- **Fase 2: Dominio Core en Paralelo:**
  - `rebgarci`: Helpers de autorización en servidor con BD (`requireAuth`, `requireOrgRole`).
  - `mvigara-`: Clubes, membresías, roles Manager/Athlete y Grupos por nivel/objetivo.
  - `jtivan-r`: Templates, sesiones y registro de `session_logs` con RPE (1-10) invocando `calculateVolumeTrend`.
  - `jmateo-v`: Contactos, DM 1 a 1 y disparadores centrales de notificaciones (`notify()`).
  - `Furiosso`: Servicio de avatares con control de acceso + lógica de dominio `calculateVolumeTrend(athleteId, date)` + contratos/modelos de Events y Spot Requests.
- **Fase 3: Integración, Eventos y Analítica:**
  - `Furiosso`: Dashboard analítico semanal (evolución a 6 semanas, gráficas y exportación CSV/PDF) + gestión de Events, reservas (`spot_requests`) y Feedback privado.
  - `jmateo-v`: Chat de Event en tiempo real vía SSE para admitidos, contador en directo y Volume Alert.
  - `mvigara-`: Vistas avanzadas de Organización + Club Profile (opt-in de estadísticas agregadas).
  - `rebgarci`: Pruebas de integración de permisos en servidor y optimizaciones SSR.
- **Fase 4: Seguridad, Legal y Evaluación:**
  - `rebgarci`: NGINX con HTTPS autofirmado (puerto 443) y `Makefile` final.
  - `jtivan-r`: 2FA (TOTP + Email OTP) y proveedores OAuth.
  - `mvigara-`: Privacy Policy, Terms y borrado GDPR real (mensajes anónimos en chat grupal y borrado de datos personales/salud).
  - `jmateo-v`: Estado online para Contactos aceptados y reconexión robusta de SSE (`Last-Event-ID`).
  - `Furiosso`: Pruebas de carga y volumen en dashboard y validación de cuotas/tipos en subida de archivos.
  - `Todo el equipo`: Documentación obligatoria en `README.md` (Team Information con los 5 roles, Project Management, Feature distribution) y checklist de evaluación (#14).

### Próximos 5 Tickets Propuestos (Fase 1)
1. `chore(db): implementar schema.prisma completo y seed de desarrollo` -> rebgarci (`chore/prisma-schema-and-seed`)
2. `feat(auth): configuración base de autenticación con Auth.js y JWT` -> jtivan-r (`feat/auth-baseline-jwt`)
3. `feat(web): diseño del layout base, navegación y rutas de la aplicación` -> mvigara- (`feat/app-layout-and-routing`)
4. `feat(realtime): endpoint SSE /api/events y función central publish` -> jmateo-v (`feat/sse-events-bus`)
5. `feat(upload): endpoint multipart de File upload y generador de métricas mock para seed` -> Furiosso (`feat/upload-baseline-and-seed-metrics`)
