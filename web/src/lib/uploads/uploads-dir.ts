// Where the uploads volume is mounted in the app container (docker-compose.yml).
// File.path is relative to it, so the database never depends on this value.
export const UPLOADS_DIR = "/data/uploads";
