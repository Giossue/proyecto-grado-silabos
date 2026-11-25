import { z } from "zod"
import { is, nullableField } from "./fields"

export const signatureSchema = z.object({ signature: nullableField("firma electrónica", [is.array()]) })
