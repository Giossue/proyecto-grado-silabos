import { SetMetadata } from "@nestjs/common"

export const ROLES = "silabos:roles"

export const Roles = (...roles: string[]) => SetMetadata(ROLES, roles)
