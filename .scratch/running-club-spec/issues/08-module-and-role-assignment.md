# Reparto de módulos y roles entre las 5 personas

Type: task
Status: resolved
Blocked by: 02, 03

## Question

Con los módulos cerrados y los criterios claros, repartir módulos y funcionalidades entre jtivan-r (PO), jmateo-v (PM), rebgarci (Tech Lead), mvigara- (Dev) y Furiosso (Dev). Todos deben contribuir a la parte obligatoria y a módulos. Resultado: tabla persona→módulos para el README (Team Information, Individual Contributions).

## Answer

| Persona | Rol | Módulos | Puntos |
|---|---|---|---|
| **rebgarci** | Tech Lead | ORM, SSR, Advanced permissions; base técnica (Docker Compose, NGINX con HTTPS, `.env.example`, esquema Prisma y migraciones) | 4 |
| **jtivan-r** | PO | Standard user management, OAuth, 2FA; núcleo de entrenamiento (Templates y Session Logs con RPE) | 4 |
| **mvigara-** | Dev (Web & Legal) | Web (framework), Organization system, GDPR; Privacy Policy, Terms of Service y Club Profile (opt-in) | 5 |
| **jmateo-v** | PM | Real-time (SSE), User interaction (chat de Event y DM, Contacts), Notification | 5 |
| **Furiosso** | Dev | Advanced analytics dashboard, File upload; Events, reservas (Spot Requests) y Feedback privado | 3 |

Total: 21 puntos (14 Major + 7 Minor). Cuentan como máximo 19 por el tope del bonus.

### Reparto de partes no ligadas a un módulo

- **Entrenamiento (Templates, sesiones y logs):** jtivan-r.
- **Eventos, reservas (Spot Requests) y Feedback privado:** Furiosso.
- **Privacy Policy, Terms of Service y Club Profile:** mvigara-.
- **File upload:** Furiosso (volumen Docker `/data/uploads`, validación MIME y endpoints protegidos).
- **Base técnica (Docker, NGINX con HTTPS, `.env.example`, Prisma):** rebgarci.
- **README (secciones obligatorias del subject):** jmateo-v coordina el documento general y Project Management; cada persona rellena la sección de sus módulos y su contribución individual.
- **Demo de la evaluación:** cada persona demuestra y explica sus propios módulos y funcionalidades lideradas.

### Dependencias entre personas a vigilar

- **Analytics y datos de prueba:** Furiosso genera 6 semanas de datos simulados en `prisma/seed/session-logs.ts` (Fase 1) para desarrollar el dashboard sin esperar al formulario de `session_logs` de jtivan-r.
- **Volume Alert:** Furiosso exporta la función `calculateVolumeTrend(athleteId, date)`, que jtivan-r invoca al guardar sesiones para disparar la notificación central de jmateo-v.
- **Reservas y Chat de Eventos:** Furiosso gestiona la Server Action de `spot_requests` (aprobación, creación de participante de chat y broadcast SSE/notificación); jmateo-v provee el componente de `<EventChat />` y el helper `publish()`.
- **Notification:** jmateo-v ofrece el mecanismo central que llaman todas las mutaciones del resto de módulos; los demás solo lo invocan.
- **Organization y permisos:** mvigara- depende de la capa de permisos en BD de rebgarci; la identidad (jtivan-r) es la base de todo.

### Acuerdos de equipo confirmados

- mvigara- asume el paquete legal completo (GDPR + Términos + Privacidad) además de Web y Organization.
- Furiosso asume el Dashboard analítico, File upload y el liderazgo funcional de Events/Reservas/Feedback.
- El balance de carga queda equilibrado entre 3 y 5 puntos por persona, eliminando cuellos de botella.
