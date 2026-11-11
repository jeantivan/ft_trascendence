# Logo

- **Fichero:** `Logo.tsx`
- **Para qué:** logo de StrideSync (SVG inline, con sus colores propios: no usa tokens, a propósito).
- **Props:** `variant`: `full` (por defecto, marca + texto) o `mark` (solo el cuadrado con el rayo, para la barra lateral colapsada). El tamaño lo da `className` (`h-8 w-auto`). Acepta el resto de props de `<svg>`.
- **Ejemplo:** `<Logo className="h-8 w-auto" />`, o `<Logo variant="mark" className="size-10" />` para solo la marca.
