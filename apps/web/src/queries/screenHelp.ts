export const screenHelpKeys = {
  all: ["screen-help"] as const,
  available: (scope: string) => ["screen-help", "available", scope] as const,
}
