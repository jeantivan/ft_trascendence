flowchart TB
    subgraph Internet
        Client([Navegador / Usuario])
    end

    subgraph Proxy Inverso
        Nginx[Nginx<br/>Terminación HTTPS]
    end

    subgraph Capa de Aplicación
        NextJS[Next.js<br/>Frontend UI]
        Backend[Backend API<br/>Node / Next.js API]
        Worker[Worker Node<br/>Procesamiento Asíncrono]
    end

    subgraph Capa de Datos y Almacenamiento
        Postgres[(PostgreSQL<br/>Base de Datos)]
        Redis[(Redis<br/>Colas y Caché)]
        MinIO[(MinIO<br/>Object Storage)]
    end

    SMTP[Servidor SMTP<br/>Envío de Correos]

    %% 1. Tráfico Principal y Subidas (Todo por HTTPS)
    Client -- "1. Navegación y API (HTTPS)" --> Nginx
    Client -. "4. Subida de archivo pesado (HTTPS)" .-> Nginx

    %% Enrutamiento interno desde Nginx (HTTP sin encriptar)
    Nginx -- "Rutea UI" --> NextJS
    Nginx -- "Rutea API" --> Backend
    Nginx -. "Proxy Pass Storage (/storage)" .-> MinIO

    NextJS -- "Llamadas Internas" --> Backend

    %% 2. Flujo de Datos Síncrono
    Backend -- "2. Consultas CRUD" --> Postgres
    Backend -- "3. Solicita Presigned URL (usando host Nginx)" --> MinIO

    %% 3. Flujo de Colas (Asíncrono)
    Backend -- "5. Encola evento de subida" --> Redis
    Redis -- "6. Asigna tarea (BullMQ)" --> Worker

    %% 4. Tareas del Worker
    Worker -- "7a. Procesa y guarda asset final" --> MinIO
    Worker -- "7b. Actualiza metadatos a 'Listo'" --> Postgres
    Worker -- "7c. Notifica al usuario" --> SMTP

    %% Estilos
    classDef proxy fill:#4ade80,stroke:#166534,stroke-width:2px,color:black;
    classDef app fill:#60a5fa,stroke:#1e3a8a,stroke-width:2px,color:black;
    classDef db fill:#f87171,stroke:#7f1d1d,stroke-width:2px,color:black;
    classDef ext fill:#facc15,stroke:#854d0e,stroke-width:2px,color:black;

    class Nginx proxy;
    class NextJS,Backend,Worker app;
    class Postgres,Redis,MinIO db;
    class SMTP ext;
