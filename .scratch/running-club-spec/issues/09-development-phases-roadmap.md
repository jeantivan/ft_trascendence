# Hoja de ruta y etapas de desarrollo (Fases 1 a 4)

Type: task
Status: open
Assignee: jtivan-r
GitHub: #17

## Question

¿Cuáles son las etapas de desarrollo para que el equipo de 4 personas pueda avanzar en paralelo sin bloqueos tras cerrar el esquema de base de datos y la arquitectura de tiempo real?

## Answer

Propuesta publicada en GitHub issue #17.

### Principios de coordinación
1. **Tipos TypeScript y Zod primero (Contratos de Datos):** definidos al inicio de cada fase para desacoplar frontend y backend.
2. **Cero push directo a `main`:** una rama por ticket (`feat/`, `fix/`, `docs/`, `chore/`) y PR pequeño revisado.
3. **Seguridad y permisos en servidor:** comprobar rol y membresía en BD en cada acción sensible (nunca solo JWT).
4. **Datos de salud protegidos:** RPE y Feedback nunca en logs, SSE ni notificaciones; cliente pide dato a endpoint con permisos.

### Fases
- **Fase 1: Cimientos Compartidos y Contratos Base:**
  - `rebgarci`: `schema.prisma` completo (#3) + migración inicial + `seed.ts` demo.
  - `jtivan-r`: Auth.js v5 con JWT, Credentials y helper `auth()`.
  - `mvigara-`: Shell web con Tailwind, layout, barra superior y sidebar con rutas base.
  - `jmateo-v`: Endpoint SSE `/api/events`, helper `publish` con `pg_notify` y listener en Node.
- **Fase 2: Dominio Core en Paralelo:**
  - `rebgarci`: Helpers de autorización en servidor con BD.
  - `mvigara-`: Clubes, membresías y grupos por nivel/objetivo.
  - `jtivan-r`: Templates, sesiones y registro de `session_logs` con RPE (1-10).
  - `jmateo-v`: Contactos, DM 1 a 1 y disparadores centrales de notificaciones.
- **Fase 3: Integración, Eventos y Analítica:**
  - `jtivan-r`: Events, reservas (`spot_requests`) y Feedback privado.
  - `jmateo-v`: Chat de Event en tiempo real vía SSE, contador en directo y Volume Alert.
  - `mvigara-`: Dashboard analítico semanal y evolución a 6 semanas.
  - `rebgarci`: File upload de avatares a volumen Docker local tras NGINX.
- **Fase 4: Seguridad, Legal y Evaluación:**
  - `rebgarci`: NGINX con HTTPS autofirmado (puerto 443) y `Makefile`.
  - `jtivan-r`: 2FA (TOTP + Email OTP) y proveedores OAuth.
  - `mvigara-`: Privacy Policy, Terms y borrado GDPR real (mensajes anónimos).
  - `jmateo-v`: Estado online para Contactos aceptados y reconexión robusta de SSE.
  - `Todo el equipo`: Documentación obligatoria en `README.md` y checklist de evaluación (#14).
