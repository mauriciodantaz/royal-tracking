/** Public app URL (snippet / Traefik host). */
export function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    process.env.AUTH_URL ??
    "http://localhost:3000"
  );
}
