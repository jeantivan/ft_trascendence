# Alert

- **File:** `Alert.tsx`
- **Purpose:** inline notice with an icon.
- **Props:** `variant`: `error` (`role="alert"`, `rpe-max` border, `warning` icon), `success` (`role="status"`, `rpe-low`, `check`) or `info` (`role="status"`, `session-rodaje`, `info`). The `children` are the message. It always renders its box: the `if (message)` goes outside.
- **Example:** `{error && <Alert variant="error">{error}</Alert>}`, or `<Alert variant="info">We have sent you a code.</Alert>`
