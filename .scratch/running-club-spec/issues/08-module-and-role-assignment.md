# Reparto de módulos y roles entre las 4 personas

Type: task
Status: resolved
Blocked by: 02, 03

## Question

Con los módulos cerrados y los criterios claros, repartir módulos y funcionalidades entre jtivan-r (PO), jmateo-v (PM), rebgarci (Tech Lead) y mvigara-. Todos deben contribuir a la parte obligatoria y a módulos. Resultado: tabla persona→módulos para el README (Team Information, Individual Contributions).

## Answer

| Persona | Rol | Módulos | Puntos |
|---|---|---|---|
| **rebgarci** | Tech Lead | ORM, SSR, Advanced permissions; base técnica (Docker Compose, NGINX con HTTPS, `.env.example`, esquema Prisma y migraciones) | 4 |
| **jtivan-r** | PO | Standard user management, OAuth, 2FA, File upload; núcleo de entrenamiento | 5 |
| **mvigara-** | Dev | Web (framework), Organization system, Advanced analytics dashboard, GDPR; Privacy Policy y Terms of Service | 7 |
| **jmateo-v** | PM | Real-time, User interaction (chat, perfil, Contacts), Notification | 5 |

Total: 21 puntos (14 Major + 7 Minor). Cuentan como máximo 19 por el tope del bonus.

### Reparto de partes no ligadas a un módulo

- **Núcleo de entrenamiento** (plantillas, `sessions`, `session_logs`, Events, reservas y Feedback): jtivan-r.
- **Privacy Policy y Terms of Service:** mvigara-.
- **Base técnica** (Docker, NGINX con HTTPS, `.env.example`, Prisma): rebgarci.
- **README** (secciones obligatorias del subject): pendiente de decidir quién lo coordina; cada persona rellena la sección de sus módulos y su contribución individual.
- **Demo de la evaluación:** cada persona demuestra y explica sus propios módulos.

### Dependencias entre personas a vigilar

- El **dashboard** (mvigara-) lee `session_logs`, que construye jtivan-r: hay que acordar pronto el contrato de datos y datos de prueba.
- **Notification** (jmateo-v) debe ofrecer el mecanismo central que llaman todas las mutaciones del resto de módulos; los demás solo lo invocan.
- **Events, reservas y Feedback** (jtivan-r) dependen del chat y de SSE (jmateo-v), y de los permisos (rebgarci).
- **Organization** (mvigara-) depende de la capa de permisos de rebgarci; la identidad (jtivan-r) es la base de todo.

### Supuestos a confirmar con el equipo

- La base técnica (Docker, NGINX, Prisma) sigue con rebgarci; solo se movió a mvigara- el módulo Web.
- "Núcleo" se entendió como todo el entrenamiento, no dividido con jmateo-v.
- Carga desigual: mvigara- lleva 7 puntos más el apartado legal, y jtivan-r 5 más el núcleo. Reevaluar a mitad del proyecto, por ejemplo moviendo GDPR.
