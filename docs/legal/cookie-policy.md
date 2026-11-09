# Política de Cookies

> **Borrador para revisión del equipo (sub-issue #73, parte de #8).** Los textos entre `[CORCHETES]` son comprobaciones o decisiones que el equipo debe cerrar antes de publicar; no se han inventado.

> **Proyecto académico de 42.** Los datos identificativos del responsable y de contacto son ficticios y se utilizan exclusivamente para este ejercicio; no identifican a una empresa real responsable de este servicio.

**Última actualización:** 9 de noviembre de 2026

## 1. Qué son las cookies

Una cookie es un pequeño archivo que un sitio web guarda en tu navegador. Sirve para recordar información entre una página y la siguiente, por ejemplo que ya has iniciado sesión.

Esta política explica qué cookies usa **Stride Sync** (en adelante, "la plataforma"), para qué sirven y cómo puedes controlarlas. Complementa la Política de Privacidad.

- **Responsable:** TRANSCENDENCE RUNNING HUB HOLDING SL, CIF B42424242. Calle De La Trancendencia, 42. 28042 Madrid, España. Teléfono +34 642 42 42 42
- **Contacto:** legal@stridesync.fit

## 2. Qué cookies usamos

La plataforma solo usa cookies para gestionar el inicio de sesión y su seguridad. No usamos cookies de analítica, publicidad ni seguimiento, y no hay cookies de terceros.

| Cookie | Para qué sirve | Cuándo se crea | Duración |
|---|---|---|---|
| `__Secure-authjs.session-token` | Mantiene tu sesión iniciada mediante un token de autenticación | Al iniciar sesión | 30 días desde su emisión o renovación. El plazo puede renovarse mientras utilizas la plataforma |
| `__Host-authjs.csrf-token` | Protege los formularios frente a peticiones falsificadas entre sitios (CSRF) | Al abrir la página de inicio de sesión | De sesión, sin caducidad persistente declarada |
| `__Secure-authjs.callback-url` | Recuerda a qué página volver después de iniciar sesión | Al abrir la página de inicio de sesión | De sesión, sin caducidad persistente declarada |

En la configuración HTTPS de la plataforma, estas cookies utilizan los atributos `HttpOnly`, `Secure` y `SameSite=Lax`.

Estas cookies no guardan tus datos de salud (RPE, Feedback) ni tus mensajes. La aplicación no utiliza `localStorage` ni `sessionStorage` para almacenar información en tu navegador.

## 3. Uso de cookies y consentimiento

Usamos las cookies descritas para gestionar el inicio de sesión, proteger los formularios y recordar la página de retorno.

[PENDIENTE ANTES DE PUBLICAR: verificar si todas estas cookies están exceptuadas del consentimiento. En particular, revisar la necesidad y proporcionalidad de mantener la autenticación durante 30 días: hoy se aplica siempre al iniciar sesión, sin que el usuario la solicite.]

Si incorporamos cookies que requieran consentimiento, lo solicitaremos antes de instalarlas o utilizarlas y actualizaremos esta política.

## 4. Inicio de sesión con proveedores externos

Hoy solo puedes acceder con email y contraseña. Está previsto incorporar el inicio de sesión con 42 (Intra), Google y GitHub, pero todavía no está disponible. Antes de activarlo, actualizaremos esta política con las cookies que se usen en ese proceso.

## 5. Cómo controlar o borrar las cookies

Puedes ver y borrar las cookies desde los ajustes de tu navegador, y configurarlo para que las bloquee. Si bloqueas estas cookies, el inicio de sesión o sus mecanismos de seguridad pueden dejar de funcionar correctamente. Si borras la cookie de autenticación, tendrás que volver a iniciar sesión.

Al cerrar sesión desde la plataforma se elimina la cookie de autenticación.

## 6. Cambios en esta política

Si cambiamos las cookies que usamos, actualizaremos esta política y la fecha de arriba. Si la modificamos de forma relevante, te avisaremos por email con al menos 30 días de antelación, igual que en la Política de Privacidad.

## 7. Contacto

Para dudas sobre cookies o privacidad: legal@stridesync.fit
