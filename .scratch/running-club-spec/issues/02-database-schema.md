# Esquema de base de datos

Type: grilling
Status: open
Blocked by: 01

## Question

¿Cuáles son las tablas y relaciones de PostgreSQL? Decisión ya tomada: columnas relacionales para Completion, RPE, distancia y tiempo, más una columna `extra` JSONB para métricas futuras. Hay que cerrar claves, relaciones (Group↔Athlete muchos a muchos, Plan como copia de Template, Spot Request, Contact con aceptación), qué se calcula (frecuencia semanal, volumen, Volume Alert) y qué se guarda, y qué consultas necesita el dashboard.
