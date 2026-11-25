import { type ArgumentMetadata, Injectable, type PipeTransform } from "@nestjs/common"
import { isZodDto } from "nestjs-zod/dto"
import type { z } from "zod"
import { validateSchema } from "../../server/http/schemaValidation"
import { validationError } from "../../server/http/responses"
import { ResponseException } from "../exceptions/response.exception"

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    const dto = metadata.metatype
    if (!isZodDto(dto)) return value
    const { data, errors } = await validateSchema(dto.schema as z.ZodType, value ?? {})
    if (errors) throw new ResponseException(validationError(errors))
    return data
  }
}
