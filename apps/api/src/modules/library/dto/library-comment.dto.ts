import { libraryCommentSchema } from "@silabos/shared/schemas/library"
import { createZodDto } from "nestjs-zod"

export class LibraryCommentDto extends createZodDto(libraryCommentSchema) {}
