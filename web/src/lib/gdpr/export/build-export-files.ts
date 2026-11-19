import type { ExportFile } from "@/lib/gdpr/export/write-export-zip";

// What the export may read about a user. The repository selects exactly these
// fields, so secrets (password_hash, totp_secret, OAuth tokens) never reach the ZIP.
export type ExportProfileSource = {
  id: string;
  email: string;
  nick: string | null;
  image: string | null;
  createdAt: Date;
  hasPassword: boolean;
  providers: string[];
  totpEnabled: boolean;
  email2faEnabled: boolean;
};

export type ExportUserRepository = {
  findProfile(userId: string): Promise<ExportProfileSource | null>;
};

// ISO 8601 in UTC without milliseconds (docs/gdpr/export-spec.md, section 3)
function toExportDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export async function buildExportFiles(
  userId: string,
  repository: ExportUserRepository,
  now: Date,
): Promise<ExportFile[] | null> {
  const profile = await repository.findProfile(userId);
  if (profile === null) return null;

  const data = {
    exported_at: toExportDate(now),
    profile: {
      id: profile.id,
      email: profile.email,
      nick: profile.nick,
      image: profile.image,
      created_at: toExportDate(profile.createdAt),
      login_methods: [...(profile.hasPassword ? ["password"] : []), ...profile.providers],
      totp_enabled: profile.totpEnabled,
      email_2fa_enabled: profile.email2faEnabled,
    },
  };
  return [
    { name: "data.json", content: JSON.stringify(data, null, 2) },
    { name: "README.txt", content: buildReadme(profile.email, now) },
  ];
}

// Text from docs/gdpr/export-spec.md section 3.5, limited to what the ZIP holds today.
// Platform name and contact come from the privacy policy draft (docs/legal/privacy-policy.md).
function buildReadme(email: string, now: Date): string {
  const date = toExportDate(now).replace("T", " ").replace(/:\d{2}Z$/, " UTC");
  return [
    "DATOS EXPORTADOS DE STRIDESYNC",
    `Fecha: ${date}`,
    `Usuario: ${email}`,
    "",
    "CONTENIDO:",
    "- data.json: tu perfil (identificador, email, nick, imagen, fecha de alta,",
    "  métodos de acceso y ajustes de seguridad)",
    "",
    "ZONA HORARIA: UTC",
    "",
    "NO SE INCLUYE:",
    "- Contraseñas, credenciales OAuth ni secretos de autenticación (TOTP)",
    "- Datos de otras personas",
    "",
    "Si necesitas más datos de los que incluye la descarga, escribe a",
    "legal@stridesync.fit.",
    "",
  ].join("\n");
}
