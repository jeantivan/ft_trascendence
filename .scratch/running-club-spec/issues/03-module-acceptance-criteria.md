# Criterios de aceptación de los módulos

Type: research
Status: resolved

## Question

Para cada módulo de `ideas/modulos.md` (7 Major y 7 Minor), extraer del subject qué hay que demostrar en la evaluación y qué comprobaciones pueden dejarlo en 0 puntos. Prestar atención especial a Notification system (CUD de todas las acciones), Real-time con SSE (el subject dice "WebSockets o similar"), SSR y 2FA. Resultado: checklist por módulo.

## Research

Branch `research/module-acceptance-criteria`, file `.scratch/running-club-spec/research/03-module-acceptance-criteria.md`.

## Answer

Checklist por módulo en `research/03-module-acceptance-criteria.md`. Decisiones del equipo sobre sus preguntas abiertas:

- SSE se acepta como "WebSockets o similar"; se justifica en el README y se demuestra la reconexión. Sin plan B construido.
- Notification system: mecanismo central que genera notificación para los usuarios afectados en toda creación, actualización y borrado relevante; entrega por SSE; test automático que recorre todas las mutaciones.
- OAuth: Google, GitHub y 42.
- 2FA: código de 6 dígitos por email con caducidad, más TOTP. No se exige a quien entra por OAuth.
- Email: Mailpit en el Compose (desarrollo y demo) más Brevo por SMTP para envío real, vía Nodemailer con configuración por variables de entorno. Límites de Brevo sin verificar.
