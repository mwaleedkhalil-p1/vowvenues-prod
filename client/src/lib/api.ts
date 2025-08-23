// Centralized API base handling for frontend
export const API_BASE: string = (import.meta as any).env?.VITE_API_URL || "";

export function withBase(path: string): string {
  if (!API_BASE) return path;
  // Avoid double slashes
  if (API_BASE.endsWith("/") && path.startsWith("/")) return API_BASE + path.slice(1);
  return API_BASE + path;
}