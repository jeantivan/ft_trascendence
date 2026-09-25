---
project_name: "Sports Management SaaS - Omnisport Hub"
context: "Proyecto ft_transcendence - Escuela 42"
target_audience: "B2B (Clubes deportivos, academias, equipos amateurs y profesionales)"
document_type: "Product Requirements Document (PRD) & Spec Driven Development Base"
version: "1.0.0"
---


# 2. Finalidad
El objetivo final del proyecto es construir una plataforma SaaS (Software as a Service) B2B multiplataforma que centralice la gestión administrativa, táctica, física y médica de equipos deportivos. Busca eliminar la fragmentación de la información (WhatsApp, Excel, PDFs sueltos) proporcionando un entorno seguro, en tiempo real y basado en roles, diseñado inicialmente para cumplir con los estándares técnicos del proyecto `ft_transcendence` de la escuela 42.

# 3. Mis Ideas Principales (Concepción Original)
*Enfoque original: Equipo de fútbol.*
*   **Gestión de Roles:** Jugadores y Staff (Entrenador General, Entrenadores específicos, Médicos, Fisios, Nutricionistas, etc.).
*   **Cronograma:** Gestión diaria/semanal/mensual para sesiones de entrenamiento, partidos, fisio, trabajo muscular, etc.
*   **Sección de Estudios (Táctica):** Preparación de estrategias (equipo/individual) con videos, lecturas y recursos didácticos (gráficas).
*   **Comunicación Interna:** Compartir notas entre el staff. *Ejemplo: El fisio envía una nota de recuperación al segundo entrenador.*
*   **Verificación de Estudios (Accountability):** El entrenador sube un video obligatorio. El sistema envía recordatorios a quienes no lo han visto y notifica al entrenador cuando un jugador lo completa.
*   **Analíticas:** Gráficos y datos personalizados sobre el desempeño en juegos pasados.
*   **Inteligencia Competitiva:** [Posible Idea] Almacenar y visualizar datos/scouting sobre equipos rivales y juegos futuros.

# 4. MVP (Minimum Viable Product) - Enfoque Agnóstico y Simplificado
*Diseñado para cumplir los requisitos de 42 minimizando el Scope Creep y siendo adaptable a cualquier deporte.*

### A. Jerarquía de Roles Simplificada (Control de Acceso - RBAC)
*   **Manager (Admin/Míster):** Control total de la organización. Crea eventos, gestiona usuarios, accede a todos los reportes médicos y tácticos.
*   **Staff (Especialistas):** Permisos de escritura segmentados. *Ejemplo: Un fisio puede editar la ficha médica, pero no puede eliminar un partido.*
*   **Athlete (Jugador):** Rol de solo lectura para el calendario y tácticas. Capacidad de interactuar (confirmar asistencia, marcar videos como vistos).

### B. Arquitectura de Datos Agnóstica
*   Terminología neutral: `Athlete` (no jugador), `Competition/Event` (no partido), `Manager` (no míster).
*   **Métricas Dinámicas:** En lugar de columnas fijas en SQL, uso de JSONB (en PostgreSQL) o arquitectura EAV (Entity-Attribute-Value) para permitir que cada club defina sus métricas (ej. Posesión en fútbol, Zonas HR en running, Cargas en gimnasio). [Necesita claridad: Decidir entre modelo Relacional Estricto vs JSONB para escalabilidad de analíticas].

### C. Módulos Core del MVP
*   **Calendario Unificado:** Una sola entidad `Event` en la base de datos con un campo `type` (Match, Training, Medical, Tactical).
*   **Sistema de Video "Sin Carga":** Embeber (iframes) videos de plataformas externas (YouTube, Vimeo) en lugar de subir archivos `.mp4` para no saturar el servidor.
*   **Acuse de Recibo en Tiempo Real:** Tracker en el frontend que verifica el tiempo de permanencia en la vista del video. Al completarse, dispara un evento por WebSocket al backend para notificar al Manager.
*   **Comunicación de Staff en Tiempo Real:** Canales de chat segmentados por SSE (Canal Técnico, Canal Médico) en lugar de un simple envío de "notas" asíncronas.

# 5. Mapeo con los Módulos de ft_transcendence (Target: 14+ Puntos)
*   **Web Frameworks (2 pts):** Next.js/React (Fullstack framework)
*   **Standard User Management (2 pts):** Autenticación y perfiles completos.
*   **Advanced permissions system (2 pts):** Implementación de los roles Manager, Staff y Athlete con vistas condicionales.
*   **Organization system (2 pts):** Capacidad de crear un "Club", invitar miembros y expulsarlos.
*   **Analytics dashboard (2 pts):** Gráficas de rendimiento dinámicas (minutos, asistencias, cargas físicas) exportables.
*   **User interaction / Real-time (2 pts):** Chat segmentado para el staff.
*   **Notification system (1 pt):** Alertas de videos no vistos y confirmaciones de lectura.
*   **File upload (1 pt):** Subida de PDFs (tácticas), imágenes (análisis de rivales) y avatares.
*   *Total Parcial Proyectado: 14 puntos (Core seguro).*

# 6. Ideas de Features para la Expansión (Comercialización)
*Funcionalidades para escalar el MVP a un producto real, post-evaluación.*

*   **Integración de Wearables (APIs de Terceros):** Conexión vía OAuth con Strava, Garmin Connect, o Apple Health para automatizar la recolección de carga física, HR, y sueño. [Posible Idea]
*   **Módulo Financiero/Administrativo:** Control de cuotas de los atletas, multas internas del equipo, y fichas federativas.
*   **Gestión de Inventario (Material):** Base de datos relacional para asignar y trackear balones, petos, chalecos GPS y material médico.
*   **Portafolio Público (Sports CV):** Generación de una vista pública (URL única compartible) por Atleta para labores de scouting, mostrando sus KPIs principales.
*   **Módulo de Inteligencia Artificial (IA):** [Posible Idea / Necesita claridad] Integrar un LLM para analizar transcripciones de partidos o resumir automáticamente las notas médicas del fisio a un lenguaje no técnico para el Manager.
