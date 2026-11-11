# Input

- **Fichero:** `Input.tsx`
- **Para qué:** campo de texto de una línea (48px).
- **Props:** acepta las props de `<input>` y `className`. Con `aria-invalid="true"` muestra borde y foco en rojo (`rpe-max`); en reposo, foco `volt`. `disabled` lo atenúa. La etiqueta (`<label htmlFor>`) va fuera del componente.
- **Ejemplo:** `<label htmlFor="email">Email</label>` y `<Input id="email" name="email" type="email" aria-invalid={Boolean(error)} />`
