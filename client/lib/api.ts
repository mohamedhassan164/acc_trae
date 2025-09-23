export function apiUrl(path: string): string {
  const base = (import.meta as any).env?.VITE_API_BASE as string | undefined;
  if (!base) return path;
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${b}${path}`;
}
