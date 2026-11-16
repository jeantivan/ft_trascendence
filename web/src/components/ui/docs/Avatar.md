# Avatar

- **Fichero:** `Avatar.tsx`
- **Para qué:** foto de perfil o silueta genérica determinista (#130). Protege la privacidad (#2) renderizando una estructura DOM idéntica tanto si el usuario tiene foto como si no.
- **Props:** `image`: URL de la imagen o `null`/`undefined` (renderiza silueta por defecto); `alt`: texto accesible (por defecto `"Foto de perfil"`, pasar `""` para decorativo); `size`: `sm` (32px / `size-8`), `md` (40px / `size-10`, por defecto), `lg` (64px / `size-16`). Acepta el resto de props de `<div>` y `className`.
- **Ejemplo:** `<Avatar image={user.image} alt={user.nick ?? "Usuario"} size="md" />`
