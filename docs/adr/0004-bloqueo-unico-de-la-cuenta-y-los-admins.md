# Bloqueo único de la cuenta y de todos los Admins

Borrar una cuenta, bloquearla (#102) o quitarle el rol Admin (#103) toman, en **una sola sentencia** `SELECT … FOR UPDATE … ORDER BY id`, la fila de la cuenta afectada y las de **todos los Admins** (`lockAccountAndAdmins`, `web/src/lib/admin/lock-account-and-admins.ts`). La regla del último Admin ("siempre queda al menos un Admin sin bloquear") se comprueba **después** del bloqueo, con las filas leídas. Una sola sentencia en orden de id hace que dos transacciones tomen siempre las filas en el mismo orden, así que dos Admins que actúan entre sí no se bloquean mutuamente (`40P01`) y no pueden pasar la comprobación a la vez dejando el sistema sin Admin.

## Considered Options

- **Bloquear solo la fila propia y las de los Admins solo cuando haga falta:** descartado. Hay que leer el rol antes de bloquear y volver a comprobarlo después; si entre medias alguien promueve a Admin a la cuenta, la transacción ya tiene su fila y necesita las de los demás Admins en otro orden, y vuelve el riesgo de deadlock. La ganancia (que un borrado normal no bloquee a los Admins unos milisegundos) es despreciable con pocos Admins.
- **Contar los Admins antes de bloquear:** descartado; dos transacciones ven el mismo estado, las dos pasan la regla y no queda ningún Admin.
- **Bloquear la fila propia y después las de los demás Admins:** descartado; dos Admins que se borran entre sí toman las filas en orden cruzado y se produce un deadlock.

## Consequences

- **Cada borrado, bloqueo o cambio de rol bloquea todas las filas de Admin hasta el commit.** Es un coste por operación, aceptado mientras haya pocos Admins. La espera cuenta contra el timeout de la transacción (5 s por defecto).
- **Los flujos de #102, #103 y #104 deben usar `lockAccountAndAdmins`** y aplicar la regla con su resultado; no deben contar Admins por su cuenta.
- **El orden de bloqueo es: users, después organizations, después conversations.** Cualquier flujo nuevo que bloquee varias tablas debe respetarlo.
- **Afecta solo a** `delete-account.ts` (los dos caminos de borrado) y al test del #122; no hay más código que escriba `roleGlobal` o `blockedAt` todavía.
- **Reabrir esta decisión** si el número de Admins crece o aparece un caso concreto de contención.
