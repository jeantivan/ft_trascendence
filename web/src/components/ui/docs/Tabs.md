# Tabs

- **File:** `Tabs.tsx` (client component)
- **Purpose:** accessible tab navigation (`segmented` pill container or `underline` bar) for switching views within a page or card.
- **Props:**
  - `Tabs`: `value` (controlled) or `defaultValue` (uncontrolled), `onValueChange`, `variant` (`"segmented"` by default, or `"underline"`), `activationMode` (`"automatic"` by default, or `"manual"`).
  - `TabsList`: `role="tablist"` container; pass `aria-label` (or `aria-labelledby`) and optional `className`.
  - `TabsTrigger`: `value` (required), `disabled`, optional `icon` (`IconName`) and `badge` (`ReactNode`).
  - `TabsContent`: `value` (required), `keepMounted` (`false` by default; keeps DOM and React state alive while hidden when `true`).
- **Behaviour:** links each trigger and panel with `aria-controls` / `aria-labelledby`, uses roving `tabIndex`, and supports `ArrowLeft`, `ArrowRight`, `Home` and `End` (skipping disabled triggers).
- **Example:**

  ```tsx
  <Tabs defaultValue="perfil">
    <TabsList aria-label="Secciones de ajustes">
      <TabsTrigger value="perfil">Perfil</TabsTrigger>
      <TabsTrigger value="privacidad" icon="lock">Privacidad</TabsTrigger>
    </TabsList>
    <TabsContent value="perfil">Contenido de perfil</TabsContent>
    <TabsContent value="privacidad">Contenido de privacidad</TabsContent>
  </Tabs>
  ```
