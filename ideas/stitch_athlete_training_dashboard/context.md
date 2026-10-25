# Domain Glossary

Plataforma para clubes de running: grupos por nivel y objetivo, entrenamientos planificados por managers, y eventos presenciales para fomentar el contacto en la vida real.

- **Organization (Club)**: Entidad que agrupa a Managers, Athletes y Groups bajo un mismo entorno. Pueden existir varios clubes en la plataforma.
- **Admin**: Rol de plataforma, ajeno a cualquier club. Es el único que crea clubes y da o retira el rol de Manager. Gestiona cuentas y contenido denunciado, pero no lee DM ni RPE.
- **Manager**: Entrenador de un club, nombrado por el Admin. Un club siempre tiene al menos uno. El rol es por club, no global. Crea Groups, Training Templates, Events y Customized Sessions; administra el chat de los Events y da Feedback en ellos.
- **Athlete**: Corredor miembro de un club. Entra por invitación de un Manager o por solicitud que un Manager aprueba. Registra las métricas de sus Sessions, confirma asistencia a Events y gestiona sus Contacts.
- **Group**: Conjunto de Athletes de un club definido por dos atributos independientes: nivel y objetivo (maratón, carrera corta, media distancia, marcha...). Un Athlete puede estar en varios Groups.
- **Training Template**: Lista reutilizable de Template Sessions. Al asignarse se copia: editar la copia no afecta a la plantilla ni a otros destinatarios.
- **Session**: Unidad de entrenamiento de un Athlete, con un Session Type. Tiene tres orígenes:
  - **Template Session**: viene de una Training Template asignada a un Group.
  - **Customized Session**: modificación de una Template Session hecha por el Manager para un Athlete concreto.
  - **Free Session**: creada por el propio Athlete con lo que le apetezca hacer.
- **Session Type**: rodaje, intervalos, cuestas, tirada larga o fartlek.
- **Event**: Session de grupo con calendario y chat propio. Es presencial. Puede venir de una Training Template (con objetivo) o ser una quedada sin plantilla (solo fecha, lugar y chat). Todos los miembros del club ven todos los Events y su número de apuntados.
- **Spot Request (Reserva)**: Solicitud de un Athlete para asistir a un Event. El Manager decide si concede el acceso; solo los admitidos entran al chat del Event. Los Managers administran el chat.
- **Session Metrics**: Datos que el Athlete introduce al terminar una Session: Completion, RPE y, como complemento opcional, distancia y tiempo. Frecuencia semanal y volumen semanal se derivan de ellas.
- **Completion**: Marca del Athlete sobre una Session: completada / no completada.
- **RPE (Esfuerzo Percibido)**: Valoración subjetiva del Athlete, de 1 a 10, sobre lo duro que fue una Session. Orientación: rodajes suaves 4-5, sesiones duras 7-9.
- **Feedback**: Comentario privado del Manager a un Athlete en la ficha del Event, con opinión y motivación. Solo existe en Events; las Free Sessions y Customized Sessions personales solo tienen Completion y RPE.
- **Contact**: Relación de amistad entre dos usuarios. Un Athlete puede solicitar Contact a cualquier miembro de un Group que comparta; solo es Contact cuando la otra persona acepta.
- **Volume Alert**: Aviso (no bloqueo) cuando el volumen semanal de un Athlete sube más de un 10 % respecto a la semana anterior. Se muestra al Athlete y se notifica al Manager.
- **Club Profile**: Perfil visible solo para miembros del mismo club: nick y foto siempre; estadísticas agregadas (km totales, sesiones completadas, frecuencia) solo si el Athlete lo activa (opt-in, desactivado por defecto). Nunca expone RPE ni Feedback.
