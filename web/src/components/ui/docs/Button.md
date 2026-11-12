# Button

- **Fichero:** `Button.tsx`
- **Para qué:** acciones y enlaces con aspecto de botón (48px).
- **Props:** `variant`: `primary` (por defecto), `ghost`, `destructive`. Con `href` es un `Link`; sin `href`, un `<button type="button">` (pasa `type="submit"` para enviar formularios). Acepta el resto de props de `<button>` o `Link` y `className`.
- **Ejemplo:** `<Button variant="ghost" href="/events">Ver Events</Button>`
