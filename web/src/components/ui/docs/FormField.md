# FormField

- **Fichero:** `FormField.tsx`
- **Para qué:** campo de formulario: etiqueta + control + mensaje de error.
- **Props:** `label`, `htmlFor` (el `id` del control), `error` (opcional) y un único hijo (`Input`...). Con `error` muestra el mensaje en rojo (`role="alert"`) y añade `aria-invalid` y `aria-describedby` al control.
- **Ejemplo:** `<FormField label="Email" htmlFor="email" error={emailError}><Input id="email" name="email" type="email" /></FormField>` (el `id` del `Input` y `htmlFor` deben coincidir)
