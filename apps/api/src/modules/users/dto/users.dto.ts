import { managedUserSchema, newManagedUserSchema } from "@silabos/shared/schemas/people"
import { createZodDto } from "nestjs-zod"
import { documented } from "../../auth/dto/documented"

export class NewManagedUserDto extends createZodDto(documented(newManagedUserSchema({ roleCode: undefined }))) {}

export class ManagedUserDto extends createZodDto(documented(managedUserSchema({ roleCode: undefined, currentName: "" }))) {}

