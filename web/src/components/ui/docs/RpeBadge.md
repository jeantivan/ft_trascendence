# RpeBadge

- **File:** `RpeBadge.tsx`
- **Purpose:** badge with the RPE (1-10) of a session, coloured by effort: 1-3 `rpe-low`, 4-6 `rpe-moderate`, 7-8 `rpe-hard`, 9-10 `rpe-max`.
- **Props:** `value` (`RpeValue`, the union `1 | 2 | … | 10`: a 0 or an 11 does not compile), `shape` (`"circle"` by default, 28 px, for a standalone number; `"pill"`, fixed width, when it sits next to text) and any `<span>` prop (`className`, `id`, `title`, `data-testid`…) except `children`. It renders `aria-label="RPE 7"`; the colour is never the only signal because the number is shown.
- **Health data:** RPE is health data. The component only paints the value it receives, with no logs or effects.
- **Example:** `<RpeBadge value={7} />`, `<RpeBadge value={7} shape="pill" />`
