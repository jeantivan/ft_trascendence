# Alert

- **Fichero:** `Alert.tsx`
- **Para qué:** aviso en línea con icono.
- **Props:** `variant`: `error` (`role="alert"`, borde `rpe-max`, icono `warning`), `success` (`role="status"`, `rpe-low`, `check`) o `info` (`role="status"`, `session-rodaje`, `info`). Los `children` son el mensaje. Siempre pinta su caja: el `if (mensaje)` va fuera.
- **Ejemplo:** `{error && <Alert variant="error">{error}</Alert>}`, o `<Alert variant="info">Te hemos enviado un código.</Alert>`
