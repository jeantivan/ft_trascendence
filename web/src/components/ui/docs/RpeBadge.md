# RpeBadge

- **File:** `RpeBadge.tsx`
- **Purpose:** fixed-width pill with the RPE (1-10) of a session, coloured by effort: 1-3 `rpe-low`, 4-6 `rpe-moderate`, 7-8 `rpe-hard`, 9-10 `rpe-max`.
- **Props:** `value` (`RpeValue`, the union `1 | 2 | … | 10`: a 0 or an 11 does not compile) and `className`. It renders `aria-label="RPE 7"`; the colour is never the only signal because the number is shown.
- **Health data:** RPE is health data. The component only paints the value it receives, with no logs or effects.
- **Example:** `<RpeBadge value={7} />`
