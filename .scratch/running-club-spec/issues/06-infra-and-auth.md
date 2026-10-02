# Infra y autenticación

Type: research
Status: resolved

## Question

Confirmar la pila: Next.js (App Router, SSR) con NextAuth para email/contraseña, OAuth 2.0 (42, Google, GitHub) y 2FA TOTP; Docker Compose con un solo comando; NGINX con HTTPS autofirmado; PostgreSQL y almacenamiento de archivos para File upload; `.env` y `.env.example`. Identificar incompatibilidades y el esqueleto de contenedores.

## Research

Branch `research/infra-and-auth`, file `.scratch/running-club-spec/research/06-infra-and-auth.md`.

## Answer

Informe en `research/06-infra-and-auth.md`. Pila viable: Next.js App Router, Auth.js v5 (fijar versión; en beta) con Credentials, Google, GitHub y 42; sesiones JWT con recomprobación en base de datos en acciones sensibles; TOTP propio con otplib; SSE en route handlers (runtime nodejs) detrás de NGINX con buffering off, ping periódico y HTTP/2; LISTEN/NOTIFY con `pg` y tabla como fuente de verdad más `Last-Event-ID`; almacenamiento de archivos en volumen local con ruta que comprueba permisos (MinIO descartado); Compose con nginx, app y db, certificado autofirmado generado al arrancar. Decisiones: 2FA no se exige a login OAuth; correo con Mailpit más Brevo. Pendiente de verificar antes de citar en el README: API de otplib, compatibilidad del adaptador de Prisma, comportamiento real de SSE con NGINX.
