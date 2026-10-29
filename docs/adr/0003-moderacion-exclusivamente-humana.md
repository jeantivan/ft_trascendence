# Moderación exclusivamente humana y denuncias de usuarios autenticados

La moderación de contenido la hace **solo una persona: el Admin**. No hay filtros, reglas ni algoritmos que detecten, retiren o bloqueen contenido o cuentas de forma automática. El Admin revisa cada denuncia desde su panel y decide si la desestima, retira el contenido o sanciona la cuenta. Las denuncias dentro de la aplicación las crean solo **usuarios autenticados**, sobre contenido que ya pueden ver (chat de un Event en el que participan, DMs con sus Contacts, perfiles accesibles); el servidor valida la pertenencia al recurso antes de crear el reporte. Para terceros sin sesión y notificaciones legales (art. 16 DSA) hay un email de contacto en los Terms. Se eligió así para no entrar en las decisiones automatizadas del art. 22 del RGPD y para no montar flujos anónimos ni CAPTCHAs.

## Considered Options

- **Filtros o reglas automáticas (por ejemplo antispam):** descartados; obligarían a declarar qué detectan, qué medidas aplican y cómo se recurren, y entrarían en el art. 22 del RGPD.
- **Denuncias anónimas o sin sesión dentro de la aplicación:** descartadas; exigirían CAPTCHAs, medidas antiabuso y un flujo anónimo complejo. Se cubren con el email externo.
- **Solo los Managers pueden denunciar:** descartado tras la decisión de #8; cualquier usuario autenticado puede denunciar lo que ya ve.

## Consequences

- **Toda denuncia consume tiempo humano.** No hay primera línea automática; el volumen de denuncias lo absorbe el Admin.
- **Acceso acotado y registrado.** El Admin ve solo los mensajes afectados por la denuncia, de quien denuncia y de la persona denunciada, y cada consulta queda en `audit_log` (solo identificadores, nunca el texto).
- **Validación en el servidor.** Crear una denuncia exige comprobar que el usuario tiene acceso al recurso; no basta el rol del JWT ni `proxy.ts`.
- **Cualquier automatización futura reabre esta decisión.** Si se añaden filtros o bloqueos automáticos hay que actualizar Terms y Privacy, y evaluar el art. 22.
- **Las decisiones se comunican con motivos.** Retirada, restricción, bloqueo o cancelación se notifican con el tipo de decisión, el hecho, la cláusula aplicada y cómo recurrir (sección 8 de los Terms).
