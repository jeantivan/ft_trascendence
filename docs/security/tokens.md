# Tokens en enlaces (#185)

Reglas para cualquier ruta o página que reciba un token en un enlace (verificación de email, cambio de contraseña, descarga de exportación GDPR, etc.):

1. **Siempre en query param `?token=...`**, nunca en el segmento de ruta: así NGINX y `next dev` dejan el token fuera de sus logs de acceso.
2. **Bloque `location` dedicado en `nginx/app.conf`**: cada ruta con token necesita su propio bloque `location` (como el de descarga de exportación) para que el log de errores de NGINX tampoco lo copie. El `callbackUrl` de `/login` ya está cubierto por su propio bloque.
3. **Nunca mostrar la página con el token en la URL**:
   - Si el token se consume de inmediato (p. ej. verificar email), gástalo en un Route Handler o en `proxy.ts` antes de redirigir.
   - Si hace falta después (p. ej. formulario de cambio de contraseña), guárdalo en una cookie `HttpOnly; Secure; SameSite=Lax`, acotada solo a esa ruta y con la misma caducidad que el token, y redirige con `303` a la misma página sin el parámetro. Así las peticiones secundarias (CSS, imágenes, datos) nunca envían el token en `Referer`, ni siquiera desde clientes que ignoren `Referrer-Policy`.
