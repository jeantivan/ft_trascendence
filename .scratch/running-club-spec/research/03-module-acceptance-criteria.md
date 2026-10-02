# Criterios de aceptación por módulo

Ticket: `issues/03-module-acceptance-criteria.md`

Fuente primaria: texto del subject ft_transcendence v21.2 (abreviado, tal como lo pasó el PO). No se ha consultado nada más. Lo que no sale literalmente del subject está marcado como **[RIESGO]** (interpretación, no hecho) o **[PLAN]** (decisión nuestra para cubrirnos).

Regla general del subject: solo cuentan los módulos totalmente funcionales; uno no funcional vale 0. El bonus cuenta como máximo 5 puntos sobre los 14. Con 21 puntos planeados y tope útil en 19, el margen es 2 puntos: un Major caído, o dos Minor, lo agotan.

## 0. Parte obligatoria

Checklist transversal, demostrable en directo.

- [ ] Páginas de Privacy Policy y Terms of Service accesibles desde la app, con contenido real (no lorem ipsum), enlazadas desde footer y registro.
- [ ] HTTPS en todo el despliegue (un certificado autofirmado vale en local, pero la app no debe romperse por ello).
- [ ] Todo arranca con un único comando Docker desde un clone limpio, sin pasos manuales.
- [ ] Sin warnings ni errores en la consola del navegador durante la navegación normal. **[PLAN]** Revisar hydration warnings de Next.js, claves de React, contenido mixto y 404 de favicon/assets. Afecta a SSR y SSE.
- [ ] Formularios validados en cliente y en servidor (probar saltándose el cliente con curl).
- [ ] Varios usuarios a la vez sin interferirse (concurrencia): dos navegadores con estado propio, sin fugas entre sesiones.
- [ ] Accesibilidad básica (semántica, contraste, teclado, etiquetas), según `ideas/modulos.md`. El texto del subject que se nos pasó no la detalla; verificar en el subject completo.
- [ ] **[PLAN]** Secretos fuera del repo (`.env` ignorado, `.env.example` incluido). Práctica estándar; confirmar en el subject completo.

Lo que puede dejar todo el proyecto en riesgo (no solo un módulo): no arrancar con un comando, no tener HTTPS, faltar las páginas legales.

## 1. Major

### 1.1 Web: framework frontend + backend (Next.js), 2 pts

Subject: framework para frontend y backend; los full-stack cuentan como ambos.

- [ ] Demostrar que Next.js actúa como framework de front (componentes, routing) y de back (route handlers / server actions con lógica real, no solo proxy).
- [ ] Poder explicar qué parte es backend (API, acceso a BD, auth) y dónde vive.
- **Riesgo de 0:** que no se vea una capa de servidor propia. **[RIESGO]** Si SSE obliga a un proceso aparte (listener de Postgres), explicarlo en el README.

### 1.2 Real-time (SSE + Postgres LISTEN/NOTIFY), 2 pts

Subject: "WebSockets or similar"; actualizaciones en tiempo real entre clientes; manejo correcto de conexión y desconexión; broadcast eficiente.

- [ ] Dos clientes distintos: una acción en uno aparece en el otro sin recargar (chat de Event, reserva aprobada, notificación).
- [ ] Desconexión: cortar la red o parar el servidor; el cliente lo detecta, muestra estado y reconecta solo. Al reconectar no se pierden mensajes (`Last-Event-ID` o refetch).
- [ ] Cierre limpio en servidor: al cerrar pestaña se libera el listener. No una conexión de BD por cliente; usar una conexión compartida para LISTEN.
- [ ] Broadcast eficiente: solo a los destinatarios interesados (por Event, Club o usuario), no a todos.
- [ ] Funciona tras HTTPS y proxy (sin buffering de SSE, cabeceras correctas, un stream por pestaña por el límite de conexiones en HTTP/1.1).
- **[RIESGO] SSE como "similar":** el subject dice "WebSockets or similar". Que SSE cuente como "similar" **no se puede verificar con el texto**; es una interpretación. SSE es unidireccional (el chat enviaría por POST). Un evaluador estricto podría exigir canal bidireccional. Mitigación: justificar por escrito en el README cómo SSE cumple cada requisito del subject, preparar la demo de reconexión y broadcast, y estimar (sin construir) un plan B que envuelva el mismo bus en WebSocket. El módulo vale 2 puntos y además sostiene Notification, presencia online, chat y dashboard en vivo.

### 1.3 User interaction (chat + perfil + amigos), 2 pts

Subject: chat básico, sistema de perfil, sistema de amigos (añadir/quitar, lista).

- [ ] Chat básico entre usuarios: DM entre Contacts. **[RIESGO]** El chat de Event no sustituye al DM; tener ambos.
- [ ] Perfil: ver el propio y el de otros (Club Profile) con datos reales.
- [ ] Amigos (Contact): enviar solicitud, aceptar/rechazar, **quitar** y **lista**. El subject pide añadir/quitar y listar; nuestro flujo con aceptación debe mostrar las tres cosas.
- [ ] Los tres bloques conectados: desde el perfil se añade contacto y se abre el chat.
- **Riesgo de 0:** falta "quitar amigo", el chat no es entre usuarios, o depende de un tiempo real roto. **[PLAN]** La solicitud solo a miembros de un Group compartido es restrictiva; sembrar usuarios de demo que lo permitan.

### 1.4 Standard user management, 2 pts

Subject: actualizar perfil, avatar (con valor por defecto), amigos con estado online, página de perfil.

- [ ] Registro, login y logout.
- [ ] Editar perfil.
- [ ] Subir avatar, con avatar por defecto si no hay.
- [ ] Lista de amigos con **estado online** correcto: cambia al conectar y desconectar (probar cierre de pestaña y timeout).
- [ ] Página de perfil.
- **Riesgo de 0:** estado online pegado tras desconexión; falta el avatar por defecto. **[RIESGO]** Con OAuth, comprobar que editar perfil/contraseña tiene sentido para usuarios solo-OAuth.

### 1.5 Advanced permissions, 2 pts

Subject: ver/editar/borrar usuarios (CRUD), gestión de roles, vistas distintas por rol.

- [ ] CRUD de usuarios (ver, editar, borrar) por quien tenga permiso (Admin).
- [ ] Gestión de roles: cambiar el rol de un usuario desde la UI.
- [ ] Vistas distintas por rol: Admin, Manager y Athlete.
- [ ] Permisos aplicados **en servidor**, no solo ocultando botones: con curl, un Athlete recibe 403 en endpoints de Manager o Admin.
- [ ] Una cuenta sembrada por rol para la demo.
- **Riesgo de 0:** permisos solo en front; roles definidos sin pantalla para gestionarlos. **[RIESGO]** Admin es de plataforma y Manager/Athlete de club; la gestión de roles debe mostrar ese reparto sin ambigüedad.

### 1.6 Organization system, 2 pts

Subject: crear/editar/borrar organizaciones, añadir/quitar usuarios, ver organizaciones y permitir acciones dentro de ellas (mínimo crear, leer, actualizar).

- [ ] Crear, editar y borrar un Club.
- [ ] Añadir y quitar usuarios de un Club.
- [ ] Ver la lista de clubes y entrar en uno.
- [ ] **Acciones dentro del club**, al menos crear, leer y actualizar (Groups, Events, Training Templates), demostradas en el contexto de la organización y no solo el CRUD del club.
- [ ] **[PLAN]** Aislamiento entre clubes, probado con dos clubes sembrados.
- **Riesgo de 0:** que las acciones dentro del club queden fuera de su contexto. Borrar un club con datos asociados debe tener comportamiento definido (cascada o bloqueo) para no fallar en directo.

### 1.7 Advanced analytics dashboard, 2 pts

Subject: gráficas interactivas (línea, barra, circular), actualizaciones en tiempo real, exportación (PDF, CSV), rangos de fechas y filtros personalizables.

- [ ] Gráficas **interactivas** (tooltip, hover, leyenda): frecuencia, volumen semanal, RPE. **[RIESGO]** El subject enumera línea, barra y circular; mostrar las tres clases (p. ej. circular para distribución por Session Type).
- [ ] **Tiempo real:** al registrar métricas desde otra sesión, el dashboard cambia sin recargar (reutiliza SSE).
- [ ] **Exportación PDF y CSV**, ambas. El fichero se abre y contiene los datos correctos y filtrados.
- [ ] **Rango de fechas** personalizable y **filtros** (Group, Session Type, Athlete según rol); gráficas y exportación respetan el rango y el filtro activos.
- [ ] Datos reales en BD, con historial sembrado suficiente.
- [ ] Volume Alert (+10 %) es extra de producto, no lo pide el subject; no sustituye nada de lo anterior.
- **Riesgo de 0:** falta PDF, falta tiempo real, gráficas estáticas, filtro que no afecta a la exportación.

## 2. Minor

### 2.1 ORM (Prisma), 1 pt

- [ ] Acceso a datos mediante el ORM, con esquema y migraciones versionadas.
- [ ] Mostrar el schema y una migración.
- **Riesgo:** dominio del SQL crudo. **[PLAN]** Limitarlo a LISTEN/NOTIFY y a algún agregado del dashboard, y documentarlo.

### 2.2 Notification system, 1 pt

Subject: notificaciones para **todas** las acciones de creación, actualización y borrado.

- [ ] Demostrar que cada acción de creación, actualización y borrado genera notificación al usuario correspondiente. **[RIESGO]** El texto no aclara si "todas" es todo el sistema o solo el módulo; la lectura estricta es todo el sistema y un evaluador puede probar una acción cualquiera.
- [ ] **[PLAN]** Catálogo de disparadores (pendiente en el mapa) que cubra cada entidad: Club, Group, Training Template, Session (Template, Customized, Free), Event, Spot Request, Contact, mensajes, Feedback, perfil/usuario, roles, ficheros. Para cada una C, U y D con destinatario definido.
- [ ] **[PLAN]** Mecanismo central (hooks de Prisma o capa de servicio única) en lugar de llamadas dispersas.
- [ ] La notificación llega en tiempo real, queda en una lista persistente y se marca como leída.
- [ ] **[RIESGO]** Decidir si se notifica al propio actor. Opción segura: notificar también al actor (toast o entrada en la lista), porque un evaluador puede crear algo y esperar verlo.
- **Riesgo de 0:** el evaluador borra o edita algo que no dispara nada. Es el Minor más frágil. **[PLAN]** Test automático que recorra todas las mutaciones y compruebe que existe notificación.

### 2.3 GDPR compliance, 1 pt

Subject: solicitar datos, borrado con confirmación, exportación en formato legible, emails de confirmación.

- [ ] Solicitar los datos propios.
- [ ] Borrado de cuenta **con confirmación** explícita, que elimine o anonimice de verdad (efecto sobre chats, métricas, Feedback, clubes).
- [ ] Exportación legible (JSON, CSV o PDF) y completa (métricas, Contacts, mensajes propios).
- [ ] **Emails de confirmación** enviados de verdad. **[RIESGO]** Hace falta un servicio de correo disponible en el entorno de evaluación; si falla en directo, cae el módulo.
- **Riesgo de 0:** emails que no salen, exportación incompleta, borrado que deja huérfanos.

### 2.4 SSR, 1 pt

- [ ] Demostrar que páginas reales se renderizan en servidor: ver el HTML con datos en "ver código fuente" o con `curl`, sin ejecutar JS.
- [ ] Justificar el uso en el README (primer pintado, SEO, datos protegidos).
- [ ] Sin errores de hidratación ni warnings (se solapa con la parte obligatoria).
- **[RIESGO]** Si todo es `"use client"` con fetch en cliente, el evaluador puede dar SSR por no demostrado. **[PLAN]** Servir desde servidor al menos perfil, lista de Events y carga inicial del dashboard, y poder señalarlo.

### 2.5 2FA (TOTP), 1 pt

Subject: 2FA completo.

- [ ] Activación: QR o clave, con verificación de un primer código antes de activarlo.
- [ ] Login con 2FA: tras la contraseña se pide código; se rechazan códigos inválidos.
- [ ] Desactivación, con verificación.
- [ ] **Códigos de recuperación.** **[RIESGO]** "Completo" no está definido en el texto abreviado; la recuperación es lo que lo hace completo en la práctica.
- [ ] **[RIESGO]** Definir si usuarios OAuth pasan por 2FA y mostrar una decisión coherente.
- [ ] Secreto no expuesto en respuestas de API.
- **Riesgo de 0:** flujo parcial (solo activar), sin recuperación, desfase de reloj en el contenedor.

### 2.6 File upload, 1 pt

Subject: múltiples tipos, validación en cliente y servidor, almacenamiento seguro con control de acceso, vista previa, indicadores de progreso, borrado.

- [ ] **Varios tipos** de fichero (imágenes de avatar o Event, GPX); no basta con uno.
- [ ] Validación de tipo y tamaño en **cliente y servidor**: probar un fichero con extensión falsa y uno demasiado grande directo contra la API.
- [ ] Almacenamiento seguro y **control de acceso**: fuera de la raíz pública, nombres no controlados por el usuario, y solo descarga quien tiene permiso (p. ej. el GPX de un Athlete solo para él y su Manager).
- [ ] **Vista previa.**
- [ ] **Progreso** real (barra con eventos de progreso de la subida, no un spinner).
- [ ] **Borrado** (también en disco, no solo en BD).
- [ ] Persistencia entre reinicios de Docker (volumen).
- **Riesgo de 0:** falta cualquiera de los puntos; es una lista exacta. Tener un fichero grande para que el progreso se vea.

### 2.7 OAuth 2.0 (42, Google, GitHub), 1 pt

- [ ] Login funcional con al menos un proveedor real. **[RIESGO]** El texto abreviado no dice cuántos; confirmar en el subject completo.
- [ ] Credenciales de la app OAuth válidas en el entorno de evaluación; el redirect URI debe coincidir con la URL HTTPS de la demo.
- [ ] Creación o enlace de cuenta con nick y avatar del proveedor.
- **Riesgo de 0:** redirect URI que no coincide, secretos ausentes en la máquina del evaluador, proveedor caído. **[PLAN]** Segundo proveedor como respaldo.

## 3. Riesgos priorizados

| # | Riesgo | Módulos | Naturaleza |
|---|---|---|---|
| 1 | Notificar TODA creación, actualización y borrado | Notification | Requisito del subject, ejecución difícil |
| 2 | SSE aceptado como "similar" a WebSockets | Real-time y, por arrastre, Notification, presencia online, chat, dashboard en vivo | **No verificable**; es una interpretación |
| 3 | PDF y CSV, tiempo real, rango de fechas y filtros | Dashboard | Requisito del subject |
| 4 | Emails reales | GDPR | Dependencia externa |
| 5 | Seis puntos de File upload, con control de acceso | File upload | Lista exacta |
| 6 | "2FA completo" sin recuperación | 2FA | Interpretación |
| 7 | SSR demostrable | SSR | Interpretación |
| 8 | HTTPS, páginas legales, consola limpia, un comando | Todos | Requisito del subject |

Nota de dependencias (cálculo del plan, no regla del subject): si el Real-time cae, también quedan en entredicho la presencia online (User management), el tiempo real del dashboard, las notificaciones en vivo y el chat. El daño podría pasar de 2 puntos a 5 o más, y el margen del plan es 2.

## 4. Preguntas abiertas

1. ¿Se puede confirmar con el subject completo o con el staff que SSE vale como "similar"?
2. ¿"Todas las acciones" de Notification incluye las acciones sobre uno mismo y sobre cualquier entidad del sistema?
3. ¿Cuántos proveedores exige OAuth y qué cubre "2FA completo" exactamente?
4. ¿Qué servicio de email se usará en la demo de GDPR?
