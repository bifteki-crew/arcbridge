export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

export const APP_NAME = "vite-test";
