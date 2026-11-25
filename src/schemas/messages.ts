type SizeType = "string" | "numeric" | "array"

const SIZES = {
  min: {
    array: "El campo :attribute debe tener al menos :min elementos.",
    numeric: "El campo :attribute debe ser al menos :min.",
    string: "El campo :attribute debe tener al menos :min caracteres.",
  },
  max: {
    array: "El campo :attribute no debe tener más de :max elementos.",
    numeric: "El campo :attribute no debe ser mayor que :max.",
    string: "El campo :attribute no debe tener más de :max caracteres.",
  },
  between: {
    array: "El campo :attribute debe tener entre :min y :max elementos.",
    numeric: "El campo :attribute debe estar entre :min y :max.",
    string: "El campo :attribute debe tener entre :min y :max caracteres.",
  },
  gt: {
    array: "El campo :attribute debe tener más de :value elementos.",
    numeric: "El campo :attribute debe ser mayor que :value.",
    string: "El campo :attribute debe tener más de :value caracteres.",
  },
  gte: {
    array: "El campo :attribute debe tener :value elementos o más.",
    numeric: "El campo :attribute debe ser mayor o igual que :value.",
    string: "El campo :attribute debe tener :value caracteres o más.",
  },
  lt: {
    array: "El campo :attribute debe tener menos de :value elementos.",
    numeric: "El campo :attribute debe ser menor que :value.",
    string: "El campo :attribute debe tener menos de :value caracteres.",
  },
  lte: {
    array: "El campo :attribute no debe tener más de :value elementos.",
    numeric: "El campo :attribute debe ser menor o igual que :value.",
    string: "El campo :attribute debe tener :value caracteres o menos.",
  },
}

const fill = (template: string, values: Record<string, string | number>): string =>
  Object.entries(values).reduce((text, [key, value]) => text.replace(`:${key}`, String(value)), template)

export const messages = {
  required: (attribute: string) => `El campo ${attribute} es obligatorio.`,
  present: (attribute: string) => `El campo ${attribute} debe estar presente.`,
  string: (attribute: string) => `El campo ${attribute} debe ser una cadena de texto.`,
  integer: (attribute: string) => `El campo ${attribute} debe ser un número entero.`,
  numeric: (attribute: string) => `El campo ${attribute} debe ser un número.`,
  array: (attribute: string) => `El campo ${attribute} debe ser una lista.`,
  uuid: (attribute: string) => `El campo ${attribute} debe ser un UUID válido.`,
  boolean: (attribute: string) => `El campo ${attribute} debe ser verdadero o falso.`,
  distinct: (attribute: string) => `El campo ${attribute} tiene un valor duplicado.`,
  prohibited: (attribute: string) => `El campo ${attribute} está prohibido.`,
  in: (attribute: string) => `El valor seleccionado en ${attribute} no es válido.`,
  exists: (attribute: string) => `El valor seleccionado en ${attribute} no es válido.`,
  unique: (attribute: string) => `El valor del campo ${attribute} ya está en uso.`,
  regex: (attribute: string) => `El formato del campo ${attribute} no es válido.`,
  url: (attribute: string) => `El campo ${attribute} debe ser una URL válida.`,
  email: (attribute: string) => `El campo ${attribute} debe ser un correo electrónico válido.`,
  requiredIf: (attribute: string, other: string, value: string) => `El campo ${attribute} es obligatorio cuando ${other} sea ${value}.`,
  requiredUnless: (attribute: string, other: string, values: string) => `El campo ${attribute} es obligatorio a menos que ${other} esté en ${values}.`,
  min: (attribute: string, min: number, type: SizeType = "string") => fill(SIZES.min[type], { attribute, min }),
  max: (attribute: string, max: number, type: SizeType = "string") => fill(SIZES.max[type], { attribute, max }),
  between: (attribute: string, min: number, max: number, type: SizeType = "string") => fill(SIZES.between[type], { attribute, min, max }),
  gt: (attribute: string, value: string | number, type: SizeType = "numeric") => fill(SIZES.gt[type], { attribute, value }),
  gte: (attribute: string, value: string | number, type: SizeType = "numeric") => fill(SIZES.gte[type], { attribute, value }),
  lt: (attribute: string, value: string | number, type: SizeType = "numeric") => fill(SIZES.lt[type], { attribute, value }),
  lte: (attribute: string, value: string | number, type: SizeType = "numeric") => fill(SIZES.lte[type], { attribute, value }),
}
