# Research 06: infra y autenticación

Ticket: `issues/06-infra-and-auth.md`. Fecha de consulta: 2026-10-02. Las versiones citadas son las que mostraban las docs ese día (Next.js 16.3.8).

Convención: **[V]** = verificado en fuente primaria (URL citada). **[NV]** = no verificado en fuente primaria; es inferencia, práctica común o dato que hay que comprobar con una prueba real.

## Resumen

1. La pila es viable. Next.js App Router + Auth.js (v5) cubre email/contraseña, OAuth (42 trae proveedor propio, Google y GitHub también) y TOTP. **TOTP no viene en Auth.js**: se construye encima con una librería (otplib).
2. La trampa principal: el proveedor Credentials **solo funciona con sesiones JWT**. Hay que elegir JWT (decisión simple) y asumir sus consecuencias.
3. Auth.js ya no es un proyecto independiente: ahora forma parte de Better Auth y v5 sigue en beta. Riesgo de mantenimiento a tener en cuenta (no bloqueante).
4. SSE en Route Handlers funciona en runtime `nodejs`; detrás de NGINX hay que desactivar buffering y subir `proxy_read_timeout`. LISTEN/NOTIFY se hace con `pg` directo, no con Prisma.
5. MinIO Community Edition está archivado desde 2026-04-25. Recomendación: volumen local de Docker para File upload.
6. Compose con un solo comando es viable: `nginx` (TLS autofirmado) + `app` + `db` + volumen de uploads.

## 1. Next.js + Auth.js: credenciales, OAuth y TOTP

### Lo que soporta

- Auth.js v5 es App Router first: un `auth.ts` en la raíz exporta `auth`, `handlers`, `signIn`, `signOut`. Requiere Next.js >= 14. Se instala con `next-auth@beta`; es decir, **v5 sigue marcada beta** en la guía de migración. [V] https://authjs.dev/getting-started/migrating-to-v5
- Variables de entorno: `AUTH_SECRET` es la única estrictamente necesaria; `AUTH_URL` casi nunca hace falta; `AUTH_TRUST_HOST=true` detrás de proxy inverso (confía en `X-Forwarded-Host`). La página de despliegue indica que Auth.js "is now part of Better Auth". [V] https://authjs.dev/getting-started/deployment
- Sin `trustHost` se lanza `UntrustedHost`. [V] https://authjs.dev/reference/core/errors
- **42**: proveedor integrado `next-auth/providers/42-school`, variables `AUTH_42_SCHOOL_ID` y `AUTH_42_SCHOOL_SECRET`, callback `https://<host>/api/auth/callback/42-school`. Nota oficial: 42 devuelve `created_at` en `Account` como número, distinto del tipo del esquema por defecto; con adaptador Prisma hay que ajustar ese campo. [V] https://authjs.dev/getting-started/providers/42-school
- Google y GitHub: proveedores integrados estándar. [NV] No abrí sus páginas concretas; es el patrón habitual (`AUTH_GOOGLE_ID/SECRET`, `AUTH_GITHUB_ID/SECRET`). Comprobar en https://authjs.dev/getting-started/providers/google y /github.
- **Credentials**: no persiste nada en la base de datos por defecto; el cifrado de contraseñas, rate limiting y reset de contraseña los implementas tú. Auth.js recomienda OAuth/magic link/passkeys antes que contraseñas. Se pueden añadir campos extra al objeto `credentials`, y la doc menciona "2FA token" como ejemplo. [V] https://authjs.dev/getting-started/authentication/credentials

### Trampas conocidas

1. **Credentials exige estrategia JWT.** Error oficial `UnsupportedStrategy`: "Thrown when a Credentials provider is present but the JWT strategy (`strategy: "jwt"`) is not enabled." [V] https://authjs.dev/reference/core/errors
   - Consecuencia: aunque uses el adaptador Prisma (necesario para guardar `Account` de OAuth y `User`), la sesión será JWT y no se guarda fila `Session`.
   - Existen workarounds de la comunidad para crear sesiones de BD a mano con Credentials, pero son hacks que sobrescriben `jwt.encode/decode`, y los hilos mencionan también el cambio de nombre de cookie en producción (`__Secure-`). No los recomendamos. [V como existencia del hilo] https://github.com/nextauthjs/next-auth/discussions/4394
2. **JWT no se puede invalidar antes de expirar** sin una lista de bloqueo en servidor ("sign out everywhere" no es gratis). Tamaño limitado por cookie (~4096 bytes, con chunking). Con sesiones de BD se puede modificar la sesión en servidor, pero cuestan un viaje a la BD por petición. [V] https://authjs.dev/concepts/session-strategies
   - Mitigación práctica [NV, diseño propio]: JWT de vida corta y, para acciones sensibles o roles, leer el rol de la BD en la página/route handler en lugar de fiarse solo del token (el rol puede cambiar: un Admin cambia el rol de un usuario).
3. **Middleware/Proxy**: en Next.js 16 `middleware` se renombró a `proxy` y por defecto corre en runtime **Node.js** (no edge); no se puede fijar `runtime` en el archivo proxy. [V] https://nextjs.org/docs/app/api-reference/file-conventions/proxy . Antes (Next < 15.5) corría en edge y el cliente de BD (TCP) no funcionaba; Auth.js documenta el patrón de config partida (`auth.config.ts` sin adaptador para el proxy, `auth.ts` con adaptador y JWT). [V] https://authjs.dev/guides/edge-compatibility . Pendiente [NV]: confirmar si, con proxy en Node, Auth.js v5 ya permite usar la config completa. Con JWT el proxy no necesita BD, así que el patrón partido sigue siendo seguro.
4. **No confiar solo en el proxy para autorización.** La doc de Next.js advierte que las Server Functions son POST a la ruta donde se usan, y un matcher que excluya esa ruta las deja sin cobertura: hay que verificar autenticación y autorización dentro de cada Server Function / Route Handler. [V] https://nextjs.org/docs/app/api-reference/file-conventions/proxy (sección Execution order). Esto aplica a la matriz de permisos (ticket 01) y al control de acceso de File upload.
5. **Matcher del proxy**: sin `matcher` corre en todas las peticiones, incluidos `_next/static` y `public/`; usar patrón negativo. [V] misma URL.
6. **Cookie y puerto detrás de NGINX**: el callback OAuth se construye con el host de la petición; si NGINX no reenvía `Host`/`X-Forwarded-*` o no está `AUTH_TRUST_HOST`, falla. Si el sitio se sirve en un puerto no estándar (p. ej. `https://localhost:8443`), hay que registrar exactamente esa URL de callback en 42/Google/GitHub. [NV en detalle de puertos; lo demás V arriba]
7. **Google/GitHub/42 y certificado autofirmado**: el navegador del usuario hace la redirección, así que el autofirmado no rompe OAuth. El servidor app llama a los proveedores por HTTPS público, tampoco afecta. Atención: no usar `NODE_TLS_REJECT_UNAUTHORIZED=0` en la app para "arreglar" nada. [NV, razonamiento]

### Flujo de 2FA TOTP (Auth.js no lo trae)

No hay guía oficial de 2FA en Auth.js; la página de Credentials no la cubre. [V por ausencia] https://authjs.dev/getting-started/authentication/credentials

Diseño propuesto [NV, diseño propio, validar en el ticket de criterios 03]:
- Campos en `User`: `totpSecret` (cifrado en reposo con una clave de `.env`), `totpEnabled`, `totpLastUsedStep` (anti-replay) y códigos de recuperación (guardar solo hash).
- Activación: generar secreto, mostrar URI `otpauth://` como QR, exigir un código válido para activar.
- Login con 2FA: el `authorize` de Credentials recibe `email`, `password` y opcional `totp`. Si el usuario tiene 2FA y no llega código, devuelve error tipado ("2FA requerido") para que la UI pida el código en el segundo paso y reenvíe las tres cosas. Alternativa más segura pero más compleja: token intermedio de corta vida. Para OAuth + 2FA hay que decidir si se exige TOTP también tras el login OAuth (el login OAuth no pasa por `authorize`; habría que cortarlo en el callback `signIn` o con un flag en el JWT `mfaPending`). Decisión abierta, afecta al alcance del módulo.
- Reglas de la RFC 6238: ventana de tolerancia de como mucho un paso de tiempo por retardo de red; el verificador **no debe aceptar un segundo intento del mismo OTP** tras una validación correcta (anti-replay). Paso por defecto 30 s. [V] https://datatracker.ietf.org/doc/html/rfc6238
- Librería: otplib, TypeScript, cumple RFC 6238/4226, v13 es una reescritura completa (usa `@noble/hashes` y `@scure/base`). [V] https://github.com/yeojz/otplib . Los nombres exactos de la API de v13 (generar secreto, URI, verificar con tolerancia) **no los verifiqué**; consultar el README antes de codificar, porque v13 rompe con la API antigua `authenticator.*` de versiones anteriores. [NV]

## 2. SSE en Next.js, NGINX y LISTEN/NOTIFY

### Route Handlers

- Los Route Handlers usan las APIs Web `Request`/`Response`; se puede devolver `new Response(readableStream)`. La doc muestra streaming con `ReadableStream`. [V] https://nextjs.org/docs/app/api-reference/file-conventions/route
- Runtime por defecto `nodejs` (`edge` está deprecado). `maxDuration` lo fija la plataforma de despliegue; en self-hosting con `next start` no hay límite de plataforma [NV: no hay límite documentado, comprobar con una conexión de varias horas]. [V] https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config
- Desde Next 15 los `GET` ya no se cachean por defecto (dinámicos). [V] https://nextjs.org/docs/app/api-reference/file-conventions/route (Version History). Aun así, conviene `export const runtime = 'nodejs'` explícito porque `pg` necesita sockets TCP; cuidado con `export const dynamic`: la doc de segment config indica que se elimina con Cache Components activado en v16, así que no depender de él y comprobar el comportamiento real. [V para lo eliminado] 
- Cabeceras de respuesta recomendadas SSE: `Content-Type: text/event-stream`, `Cache-Control: no-cache` (MDN) y, para NGINX, `X-Accel-Buffering: no`. [V] https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events y https://nextjs.org/docs/app/guides/self-hosting
- Detectar desconexión del cliente: usar `request.signal` (`abort`) para cerrar el `LISTEN` y limpiar temporizadores. [NV: es API Web estándar, pero no confirmé en la doc de Next que se dispare en `next start` en todas las versiones; probar].
- Compresión: `next start` aplica gzip por defecto; la doc recomienda desactivarla (`compress: false`) si la comprime NGINX. Un stream comprimido puede retener datos; para SSE, desactivar gzip en el location de SSE en NGINX (`gzip off`) y/o `compress: false`. [V sobre `compress`: https://nextjs.org/docs/app/api-reference/config/next-config-js/compress ; el efecto sobre SSE es NV, probar]
- Un solo proceso Node con conexiones SSE: el estado (suscriptores en memoria) es por instancia; con un único contenedor `app` no hay problema; con varias réplicas, cada una necesita su propio `LISTEN`. [NV, razonamiento]

### NGINX

- `proxy_buffering` por defecto `on`; `proxy_read_timeout` por defecto `60s`: si el servidor no envía nada en 60 s, NGINX corta. Si el servidor responde `X-Accel-Buffering: no`, NGINX desactiva el buffering para esa respuesta (salvo `proxy_ignore_headers X-Accel-Buffering`). [V] https://nginx.org/en/docs/http/ngx_http_proxy_module.html
- `proxy_http_version 1.1` es el valor por defecto solo desde NGINX 1.29.7; fijarlo explícitamente por si la imagen es anterior. [V misma URL]
- La doc de Next.js: con NGINX hay que desactivar el buffering para streaming, p. ej. cabecera `X-Accel-Buffering: no`. [V] https://nextjs.org/docs/app/guides/self-hosting
- Location SSE sugerido [NV, a probar]:
  ```nginx
  location /api/events {
    proxy_pass http://app:3000;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    gzip off;
    proxy_read_timeout 1h;
  }
  ```
  Además, un comentario SSE (`: ping`) cada ~15 s mantiene viva la conexión frente a proxies; lo recomienda la especificación. [V] https://html.spec.whatwg.org/multipage/server-sent-events.html
- Límite HTTP/1.1: 6 conexiones por navegador y dominio (afecta a pestañas múltiples con una conexión SSE cada una); HTTP/2 permite ~100 streams. [V] MDN (URL arriba). Recomendación: habilitar `http2` en NGINX (`listen 443 ssl; http2 on;`) [NV sintaxis exacta según versión; la directiva `http2 on` es de >= 1.25.1, comprobar] y usar **una sola conexión SSE por pestaña** que multiplexe chat, notificaciones y reservas.

### Reconexión y Last-Event-ID

- `EventSource` reconecta solo; en la reconexión envía la cabecera `Last-Event-ID` con el último `id` recibido. El campo `retry:` ajusta el tiempo de reconexión. Un `204` detiene la reconexión. [V] https://html.spec.whatwg.org/multipage/server-sent-events.html y MDN.
- `EventSource` **no permite cabeceras personalizadas**; la autenticación va por cookie (misma origen, así que se envía sola) o por query string. [V spec]
- Para que el replay funcione, cada evento necesita un `id` monótono y persistido (p. ej. el id autoincremental de la tabla de eventos/mensajes/notificaciones). Al reconectar, el handler lee `Last-Event-ID` y consulta las filas con id mayor antes de volver a escuchar. [NV, patrón estándar; encaja con la recomendación de Prisma abajo]

### Postgres LISTEN/NOTIFY y Prisma

- Prisma Client no tiene API de LISTEN. El propio blog de Prisma implementa pub/sub con la librería `pg` (node-postgres): cliente dedicado, `LISTEN canal`, evento `notification`, y publica con `SELECT pg_notify($1,$2)`. [V] https://prisma.io/blog/you-dont-need-redis-postgres-already-has-pub-sub . **No encontré una issue oficial de Prisma que confirme el estado de la petición** [NV]; la conclusión se apoya en que Prisma usa `pg` para ello.
- Semántica: entrega solo a sesiones escuchando en ese momento; no se guarda para quien no esté conectado. Patrón recomendado: insertar el evento en una tabla y usar NOTIFY solo como señal. [V] el blog anterior.
- Detalles de Postgres: payload máximo 8000 bytes (enviar solo el id de la fila); las notificaciones se entregan al hacer commit y no se entregan si la transacción aborta; mismo canal+payload en la misma transacción se deduplican; cola de 8 GB; una sesión con `LISTEN` y una transacción larga abierta bloquea la limpieza de la cola. [V] https://www.postgresql.org/docs/current/sql-notify.html
- `LISTEN` dura lo que dura la sesión (conexión). Si la conexión cae, se pierde la suscripción y las notificaciones intermedias. [V parcial: https://www.postgresql.org/docs/current/sql-listen.html ; la advertencia sobre pooling transaccional tipo PgBouncer vino del resumen de la herramienta y no la vi literal en esa página, tratar como NV]. Por eso: **conexión directa a Postgres para el listener, sin pooler**, y reconexión con backoff.
- Con `pg`: usar un `Client` dedicado para escuchar (no uno del `Pool`, o hacer `release` nunca). La doc de node-postgres indica que el pool emite `error` por clientes inactivos ante caídas de red, y hay que gestionar `error`. [V sobre el pool: https://node-postgres.com/features/pooling ; la recomendación de cliente dedicado para LISTEN es mía, NV en esa página].
- Diseño recomendado [NV, a cerrar en ticket 05]:
  1. Un único listener por proceso Node (singleton, por ejemplo iniciado con `register()` de instrumentation [V que existe: https://nextjs.org/docs/app/guides/instrumentation ] o perezoso en el primer SSE), no uno por conexión SSE.
  2. El listener reparte en memoria a los suscriptores SSE según el id de usuario/canal.
  3. Al reconectar el listener tras una caída, no hay forma de saber qué se perdió: los clientes SSE se resincronizan con `Last-Event-ID` contra las tablas.
  4. Disparar `pg_notify` desde el código de aplicación tras el commit, o con triggers SQL; los triggers requieren SQL crudo en una migración de Prisma.
- Singleton y hot reload: en desarrollo, Next recarga módulos, así que el listener debe guardarse en `globalThis` para no duplicarse (mismo patrón que el singleton de PrismaClient que muestra Auth.js). [V para el patrón de PrismaClient: https://authjs.dev/getting-started/adapters/prisma ; para el listener es NV]

## 3. Topología Docker Compose

Servicios mínimos: `nginx`, `app`, `db`. Un solo comando: `docker compose up --build` (o `make` que lo envuelva). Solo `nginx` publica puertos.

- **Next.js en Docker**: soportado con todas las funciones; plantilla oficial con `output: "standalone"`. [V] https://nextjs.org/docs/app/getting-started/deploying . Recomendación oficial de poner un proxy inverso (nginx) delante. [V] https://nextjs.org/docs/app/guides/self-hosting
- **Variables en build vs runtime**: las `NEXT_PUBLIC_*` se incrustan en el bundle en `next build`; el resto se leen en servidor en tiempo de petición (render dinámico). Evitar `NEXT_PUBLIC_` para secretos y para URLs que cambien entre entornos. [V] self-hosting.
- **Orden de arranque**: `depends_on` con `condition: service_healthy` y healthcheck con `pg_isready`. Ejemplo oficial: `test: ["CMD-SHELL","pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]`. [V] https://docs.docker.com/compose/how-tos/startup-order/
- **Migraciones**: Prisma recomienda `prisma migrate deploy` (no `migrate dev`) fuera de desarrollo; `prisma` debe estar disponible en la imagen si se ejecuta ahí. [V] https://www.prisma.io/docs/orm/prisma-client/deployment/deploy-database-changes-with-prisma-migrate . Opciones: comando de arranque `sh -c "npx prisma migrate deploy && node server.js"` o un servicio efímero `migrate` del que dependa `app` con `service_completed_successfully` [NV: condición válida en Compose, no verificada aquí].
- **Prisma 7** (si se instala la última): exige driver adapter (p. ej. `@prisma/adapter-pg`), `output` obligatorio en el generator, `prisma.config.ts` y Node >= 20.19. [V] https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7 . Fijar versión mayor en `package.json` desde el inicio; el adaptador `pg` casa bien con usar `pg` para LISTEN. El adaptador Auth.js para Prisma recomienda `@prisma/client` >= 5.12 en edge; no verifiqué compatibilidad exacta de `@auth/prisma-adapter` con Prisma 7 [NV, probar antes de decidir].
- **NGINX con HTTPS autofirmado**: `listen 443 ssl; ssl_certificate; ssl_certificate_key;` TLS 1.2/1.3 por defecto desde 1.27.3. [V] https://nginx.org/en/docs/http/configuring_https_servers.html . Redirección 80 -> 443 en un `server` aparte [NV, trivial].
- **Generar el certificado sin intervención manual**: opciones, a decidir:
  a) Un servicio efímero (`openssl req -x509 -nodes -newkey rsa:2048 -days 365 -subj "/CN=localhost" ...`) que escribe en un volumen compartido si no existe el cert; nginx depende de él. [NV, patrón; comando `openssl` estándar]
  b) Script en el entrypoint de nginx (la imagen oficial ejecuta scripts de `/docker-entrypoint.d/`). [NV: confirmar en https://hub.docker.com/_/nginx]
  c) Cert generado y comprometido en el repo: **no** (clave privada en git).
- **Plantillas con variables en NGINX**: la imagen oficial hace `envsubst` de `/etc/nginx/templates/*.template` hacia `/etc/nginx/conf.d/`, útil para `server_name`. [V] https://hub.docker.com/_/nginx
- **Red**: `app` y `db` solo en la red interna de Compose; `db` sin `ports:`. [NV, buena práctica estándar]
- **Volúmenes**: `pgdata` para Postgres, `uploads` para archivos, volumen para certificados.

### Almacenamiento de archivos: volumen local vs MinIO

- **MinIO Community Edition**: el repositorio fue **archivado el 2026-04-25** y es de solo lectura; el README dice "THIS REPOSITORY IS NO LONGER MAINTAINED"; ya no hay binarios/imágenes precompiladas de la edición comunitaria (hay que compilar desde fuente) y se redirige a AIStor (comercial/free). Licencia AGPLv3. [V] https://github.com/minio/minio
- **Recomendación: volumen local** montado en `app` (`/data/uploads`), servido **solo a través de un Route Handler que comprueba permisos** (no exponer el directorio estáticamente por NGINX), lo que cumple "control de acceso" del módulo File upload. Evitar un servicio más a mantener y la dependencia de una imagen sin mantenimiento. [diseño propio, NV]
- Por tanto: avatares, imágenes de Event y GPX en el volumen; en BD solo metadatos (ruta relativa, MIME, tamaño, propietario). Validar tipo por contenido (magic bytes) y tamaño en servidor además del cliente; límite de cuerpo en NGINX (`client_max_body_size`, por defecto 1 MB, hay que subirlo para GPX/imágenes) [NV: valor por defecto de la directiva no abierto en esta sesión].
- Si hiciera falta algo compatible S3 más adelante, habría que evaluar alternativas (no investigado).

## 4. `.env` y `.env.example`

- Compose lee `.env` para interpolación en `compose.yaml`; `env_file:` inyecta un archivo en el entorno del contenedor; `environment:` fija valores en el propio compose. La interpolación dentro de `.env` es una función de Compose, no de `docker run --env-file`. La doc de Docker advierte de no usar variables de entorno para información sensible y usar *secrets*. [V] https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/
- Política propuesta [NV, convención del proyecto]:
  - `.env.example` versionado con todas las claves y valores ficticios/vacíos y comentarios; `.env` en `.gitignore` (comprobar que el subject de 42 pide que no haya credenciales en git; es un requisito habitual de la evaluación, no lo verifiqué aquí).
  - Variables mínimas: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, `AUTH_SECRET` (>= 32 caracteres aleatorios), `AUTH_TRUST_HOST=true`, `AUTH_URL` (opcional), `AUTH_42_SCHOOL_ID/SECRET`, `AUTH_GOOGLE_ID/SECRET`, `AUTH_GITHUB_ID/SECRET`, clave de cifrado del secreto TOTP, `SERVER_NAME`, `UPLOAD_DIR`. Nombres de las de proveedor: 42 [V], Google/GitHub [NV].
  - El `AUTH_SECRET` y claves OAuth reales no deben ir en la imagen; `DATABASE_URL` para la app apunta al host `db` de la red Compose.
  - Un script/`make setup` que copie `.env.example` a `.env` y genere secretos con `openssl rand -base64 32` hace el arranque "en un comando" real. [NV]
- Los OAuth necesitan credenciales reales en cada proveedor; no pueden generarse automáticamente. Para la evaluación habrá que documentar cómo darlas (el evaluador probablemente usa las del equipo). [NV]

## 5. Incompatibilidades y tensiones entre decisiones

| # | Tensión | Estado |
|---|---|---|
| 1 | Credentials requiere JWT; el adaptador Prisma implica sesiones de BD por defecto. Hay que fijar `session: { strategy: "jwt" }` explícito. | [V] Resoluble |
| 2 | JWT no se invalida en servidor, pero la matriz de permisos (ticket 01) y el borrado GDPR piden efecto inmediato. Hay que releer el rol/estado en BD en acciones sensibles. | [V] sobre JWT; mitigación NV |
| 3 | OAuth + 2FA: el login OAuth no pasa por `authorize`; decidir si TOTP aplica a cuentas OAuth. | Decisión abierta |
| 4 | Prisma no soporta LISTEN: hace falta `pg` directo además de Prisma (dos clientes de BD). | [V] indirecto, ver sección 2 |
| 5 | LISTEN necesita conexión de sesión estable; no pasar por pooler transaccional. | Parcialmente NV |
| 6 | NGINX por defecto bufferiza y corta a los 60 s: rompe SSE si no se configura. | [V] |
| 7 | HTTP/1.1 limita a 6 conexiones SSE por dominio: usar HTTP/2 y una conexión por pestaña. | [V] |
| 8 | Certificado autofirmado: avisos del navegador; cookies `Secure` y Auth.js en producción funcionan sobre HTTPS, lo que es otra razón para servir siempre por TLS (cookies con prefijo `__Secure-` en producción, según el hilo de la comunidad). | Parcialmente V |
| 9 | MinIO archivado: no usarlo. | [V] |
| 10 | Auth.js v5 en beta y absorbido por Better Auth: riesgo de cambios o mantenimiento lento. Fijar versión exacta en `package.json`. | [V] estado; riesgo NV |
| 11 | Prisma 7 requiere adaptador y `output` propio: afecta a la imagen Docker (el cliente generado ya no va a `node_modules`) y a `standalone`. | [V] cambios; impacto en standalone NV |
| 12 | Proxy (middleware) en Node en v16: ya no hay limitación edge; si se mantiene `middleware.ts` o Next < 15.5, aplica la limitación edge. Elegir Next 16 y usar `proxy.ts`. | [V] |

Ninguna incompatibilidad bloquea la pila. La que más peso tiene en el diseño es la 1/2 (JWT) y la 3 (alcance de 2FA).

## Sin verificar / pendiente de prueba

- Nombres exactos de la API de otplib v13 y compatibilidad de `@auth/prisma-adapter` con Prisma 7.
- Páginas de proveedor Google y GitHub de Auth.js (variables `AUTH_GOOGLE_*`, `AUTH_GITHUB_*`).
- Comportamiento real de SSE en `next start` + NGINX: disparo de `request.signal` al cerrar, ausencia de límite de duración, efecto de gzip. Hay que hacer una prueba de humo con una conexión larga.
- Si existe una issue oficial de Prisma sobre LISTEN/NOTIFY (no la localicé; el intento de abrir `prisma/issues/1809` resultó ser otro tema).
- Efecto de PgBouncer/pooler sobre LISTEN: no confirmado literalmente en la doc de Postgres.
- `service_completed_successfully` para un servicio de migración, sintaxis `http2 on`, `client_max_body_size` por defecto, scripts de `/docker-entrypoint.d/`.
- Requisitos del subject de 42 sobre credenciales y `.env` (no se releyó el subject).
- Diseño del flujo 2FA y de la política de rol/sesión: son propuestas, no de fuente primaria.
- Las páginas de documentación se leyeron mediante una herramienta de resumen (no el HTML bruto); los fragmentos entre comillas son literales de ese resumen y conviene reconfirmar los críticos (`UnsupportedStrategy`, RFC 6238 anti-replay, estado de MinIO) antes de citarlos en el README.

## Fuentes

- Auth.js: https://authjs.dev/getting-started/migrating-to-v5 , /getting-started/deployment , /getting-started/authentication/credentials , /getting-started/providers/42-school , /getting-started/adapters/prisma , /concepts/session-strategies , /guides/edge-compatibility , /reference/core/errors
- Next.js 16.3.8: https://nextjs.org/docs/app/api-reference/file-conventions/route , /route-segment-config , /proxy ; https://nextjs.org/docs/app/guides/self-hosting ; https://nextjs.org/docs/app/getting-started/deploying ; https://nextjs.org/docs/app/api-reference/config/next-config-js/compress
- NGINX: https://nginx.org/en/docs/http/ngx_http_proxy_module.html ; https://nginx.org/en/docs/http/configuring_https_servers.html ; https://hub.docker.com/_/nginx
- WHATWG SSE: https://html.spec.whatwg.org/multipage/server-sent-events.html ; MDN: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
- PostgreSQL: https://www.postgresql.org/docs/current/sql-notify.html ; https://www.postgresql.org/docs/current/sql-listen.html
- Prisma: https://prisma.io/blog/you-dont-need-redis-postgres-already-has-pub-sub ; https://www.prisma.io/docs/orm/prisma-client/deployment/deploy-database-changes-with-prisma-migrate ; https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7
- node-postgres: https://node-postgres.com/features/pooling
- RFC 6238: https://datatracker.ietf.org/doc/html/rfc6238 ; otplib: https://github.com/yeojz/otplib
- Docker: https://docs.docker.com/compose/how-tos/startup-order/ ; https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/
- MinIO: https://github.com/minio/minio
- Hilo comunitario (solo como evidencia de workarounds): https://github.com/nextauthjs/next-auth/discussions/4394
