export const ROOT_PATHS = ["api", "api/*path", "logos/*path", "images/*path", "plantilla.schema.json"]

export const KEYCLOAK_ROOT_PATHS = ["auth/keycloak", "auth/callback"]

export const UNPREFIXED_PATHS = [...ROOT_PATHS, ...KEYCLOAK_ROOT_PATHS]

export function isRootPath(path: string): boolean {
  const trimmed = path.replace(/^\/+|\/+$/g, "")
  return UNPREFIXED_PATHS.some((root) => (root.endsWith("/*path") ? trimmed.startsWith(root.slice(0, -"*path".length)) : trimmed === root))
}
