import { z } from "zod"
import { is, nullableField } from "./fields"

export const signatureSchema = z.object({ signature: nullableField("firma electrónica", [is.array()]) })

const isFile = (value: unknown): value is File => typeof File !== "undefined" && value instanceof File

export const signingFormSchema = z.object({
  certificate: z.custom<File | null>(isFile, "Elija su archivo .p12 o .pfx"),
  password: z.string().min(1, "Escriba la clave de su firma"),
})
