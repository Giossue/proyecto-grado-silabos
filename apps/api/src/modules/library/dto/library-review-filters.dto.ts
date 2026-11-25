import { libraryReviewFiltersSchema } from "@silabos/shared/schemas/library"
import { createZodDto } from "nestjs-zod"
import { validationContextValue } from "../../../common/context/validation-context"
import type { existenceCheck } from "../../../server/library/reviews"
import { LIBRARY_FILTER_EXISTS } from "../library-filters.interceptor"

type Exists = ReturnType<typeof existenceCheck>

const exists: Exists = (table) => (value) => (validationContextValue<Exists>(LIBRARY_FILTER_EXISTS) as Exists)(table)(value)

export class LibraryReviewFiltersDto extends createZodDto(libraryReviewFiltersSchema(exists)) {}
