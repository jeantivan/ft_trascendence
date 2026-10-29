interface AuthErrorBannerProps {
  error?: string;
}

export function AuthErrorBanner({ error }: AuthErrorBannerProps) {
  if (!error) return null;

  return (
    <div className="p-3 text-sm text-red-500 bg-red-100 dark:bg-red-950/50 rounded-md border border-red-200 dark:border-red-800">
      {error}
    </div>
  );
}
