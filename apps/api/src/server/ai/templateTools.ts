import { isRecord, list, phpShape, phpTrim, record, type PhpRecord } from "../configuration/phpValues"
import { RESPONSIBLES } from "../configuration/templateDraft"
import { variableCatalog } from "../configuration/templatePresentation"
import { AssistantDraft, TemplateDraftError } from "./assistantDraft"
import type { AiToolCall, AiToolSpec } from "./gateway"
import { phpJson } from "./php"

export const MAX_MESSAGE = 4000
export const ANSWER = "responder"
export const QUESTION = "preguntar"

const CELL_TYPES: Record<string, string> = { texto: "text", opcion: "choice", numero: "number" }

const READ_ONLY = ["ver_plantilla", "ver_campo", "listar_presets", "listar_variables", "ver_estado", "responder", "preguntar"]

export type ProcessNotice = { estado: string; aviso: string }

export type ToolResult = { content: string; failed: boolean; terminal: string | null; message: string | null }

function encode(data: unknown): string {
  return phpJson(phpShape(data), { unicode: true, slashes: true })
}

export function toolOk(data: PhpRecord): ToolResult {
  return { content: encode(data), failed: false, terminal: null, message: null }
}

export function toolError(message: string): ToolResult {
  return { content: encode({ error: message }), failed: true, terminal: null, message: null }
}

export function toolFinish(terminal: string, message: string): ToolResult {
  return { content: encode({ ok: true }), failed: false, terminal, message }
}

export interface DraftValidator {
  errors(draft: AssistantDraft): Promise<string[]>
}

function spec(name: string, description: string, properties: PhpRecord): AiToolSpec {
  return { name, description, parameters: { type: "object", properties, required: Object.keys(properties), additionalProperties: false } }
}

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
}

function stringArg(args: PhpRecord, name: string): string {
  const value = args[name]
  if (typeof value !== "string") throw new TemplateDraftError(`Falta el parámetro «${name}» como texto.`)
  return value
}

function integerArg(args: PhpRecord, name: string): number {
  const value = args[name]
  if (!isInt(value)) throw new TemplateDraftError(`Falta el parámetro «${name}» como número entero.`)
  return value
}

function isPhpListOf(value: unknown): value is unknown[] {
  return Array.isArray(value) || (isRecord(value) && Object.keys(value).every((key, index) => key === String(index)))
}

function stringsArg(args: PhpRecord, name: string): string[] {
  const value = args[name]
  if (!isPhpListOf(value) || list(value).some((item) => typeof item !== "string")) throw new TemplateDraftError(`Falta el parámetro «${name}» como lista de textos.`)
  return list(value) as string[]
}

function messageArg(args: PhpRecord, name: string): string {
  const value = phpTrim(stringArg(args, name))
  if (value === "") throw new TemplateDraftError(`El parámetro «${name}» no puede quedar vacío.`)
  return [...value].slice(0, MAX_MESSAGE).join("")
}

function mbLength(value: string): number {
  return [...value].length
}

function tableDesign(args: PhpRecord): PhpRecord {
  const columns = args.columnas
  const count = Array.isArray(columns) ? columns.length : isRecord(columns) ? Object.keys(columns).length : 0
  if (!isPhpListOf(columns) || count === 0 || count > 24) throw new TemplateDraftError("Indique de 1 a 24 columnas.")
  const design: PhpRecord = { label: phpTrim(stringArg(args, "titulo")), item: phpTrim(stringArg(args, "fila")) }
  const label = design.label as string
  const item = design.item as string
  if (label === "" || mbLength(label) > 120 || item === "" || mbLength(item) > 60) {
    throw new TemplateDraftError("Escriba el título (hasta 120 caracteres) y el nombre de cada fila (hasta 60).")
  }
  for (const [name, key] of [
    ["minimo", "min"],
    ["maximo", "max"],
    ["al_empezar", "initial"],
  ]) {
    if (!isInt(args[name])) throw new TemplateDraftError(`Falta el parámetro «${name}» como número entero.`)
    design[key] = args[name]
  }
  design.columns = list(columns).map((raw) => {
    const column = isRecord(raw) || Array.isArray(raw) ? record(raw) : null
    const name = column !== null && typeof column.nombre === "string" ? phpTrim(column.nombre) : ""
    const kind = column !== null ? column.tipo : ""
    const type = typeof kind === "string" && Object.prototype.hasOwnProperty.call(CELL_TYPES, kind) ? CELL_TYPES[kind] : null
    if (name === "" || mbLength(name) > 300 || type === null) throw new TemplateDraftError("Cada columna necesita «nombre» y un «tipo»: texto, opcion o numero.")
    const rawOptions = column !== null && (Array.isArray(column.opciones) || isRecord(column.opciones)) ? list(column.opciones) : []
    const options = rawOptions.map((option) => (typeof option === "string" ? phpTrim(option) : "")).filter((option) => option !== "")
    if (type === "choice" && (options.length === 0 || options.length !== new Set(options).size)) {
      throw new TemplateDraftError(`La columna «${name}» es de tipo opcion: escriba sus opciones sin repetir.`)
    }
    return {
      title: name,
      type,
      required: column !== null && column.obligatoria === true,
      width: null,
      ...(type === "choice"
        ? { options: options.map((option) => ({ label: option })) }
        : type === "number"
          ? { maximum: 999.99, decimals: 2 }
          : { max_length: 1000, multiline: false }),
    }
  })
  return design
}

export class TemplateTools {
  constructor(
    private readonly draft: AssistantDraft,
    private readonly validator: DraftValidator,
    private readonly process: ProcessNotice,
    private readonly preexisting: string[] = [],
  ) {}

  locked(): boolean {
    return this.process.estado === "abierta"
  }

  specs(): AiToolSpec[] {
    const key = { type: "string", description: "Clave tal como aparece en ver_plantilla." }
    const after = { type: "string", description: "Clave tras la cual va, según ver_plantilla. Use «(inicio)» para el principio o «(final)» para el final." }
    const orientation = { type: "string", enum: ["vertical", "horizontal"] }
    const responsible = {
      type: "string",
      enum: RESPONSIBLES,
      description:
        "carrera: lo escriben la carrera en el proyecto de carrera de cada asignatura y el docente en los espacios que le dejen (Carrera); institucional: texto de la plantilla, igual para todos (Institucional).",
    }
    const html = { type: "string", description: "Contenido en HTML permitido. <p></p> deja un espacio vacío para responder." }
    const specs = [
      spec("ver_plantilla", "Muestra las secciones y campos del borrador en orden, con su clave, nombre, quién llena cada campo y un resumen del contenido.", {}),
      spec("ver_campo", "Muestra el contenido completo de un campo como HTML.", { clave: key }),
      spec("listar_presets", "Lista los contenidos listos (tablas y bloques oficiales) que se ponen en un campo con usar_preset.", {}),
      spec("listar_variables", 'Lista los datos del sistema que se insertan con <span data-variable="clave"></span>.', {}),
      spec("ver_estado", "Indica si el periodo académico está abierto, en pausa o no hay, y qué implica cambiar la plantilla.", {}),
      spec("agregar_seccion", "Agrega una sección vacía después de otra sección y devuelve su clave. Después agréguele al menos un campo.", {
        titulo: { type: "string" },
        orientacion: orientation,
        despues_de: after,
      }),
      spec("renombrar_seccion", "Cambia el título de una sección.", { clave: key, titulo: { type: "string" } }),
      spec("cambiar_orientacion_seccion", "Cambia la orientación de la hoja de una sección.", { clave: key, orientacion: orientation }),
      spec("mover_seccion", "Mueve una sección para que quede justo después de otra.", { clave: key, despues_de: after }),
      spec(
        "renumerar",
        "Vuelve a numerar en orden las secciones que llevan número («7. …») y los subtítulos numerados de sus campos («7.1 …»). Úsela después de agregar, mover o quitar secciones numeradas.",
        {},
      ),
      spec("quitar_seccion", "Quita una sección con todos sus campos. Las secciones obligatorias no se pueden quitar.", { clave: key }),
      spec("agregar_campo", "Agrega un campo a una sección y devuelve su clave.", {
        seccion: key,
        nombre: { type: "string", description: "Subtítulo del campo. Vacío si no lleva subtítulo." },
        quien_llena: responsible,
        contenido_html: html,
        despues_de: after,
      }),
      spec("renombrar_campo", "Cambia el nombre (subtítulo) de un campo. Vacío quita el subtítulo.", { clave: key, nombre: { type: "string" } }),
      spec("cambiar_responsable_campo", "Cambia quién llena un campo.", { clave: key, quien_llena: responsible }),
      spec("cambiar_contenido_campo", "Reemplaza todo el contenido de un campo. Lea antes el contenido con ver_campo.", { clave: key, contenido_html: html }),
      spec("mover_campo", "Mueve un campo para que quede después de otro campo, en la misma sección o en otra.", { clave: key, seccion: key, despues_de: after }),
      spec("quitar_campo", "Quita un campo.", { clave: key }),
      spec(
        "duplicar_campo",
        "Copia un campo justo debajo de él, con clave nueva, el nombre seguido de «(copia)» y el mismo contenido y responsable; las respuestas copiadas reciben identificadores nuevos. Devuelve la clave de la copia.",
        { clave: key },
      ),
      spec(
        "duplicar_seccion",
        "Copia una sección con todos sus campos justo debajo de ella, con claves nuevas y el título seguido de «(copia)». Devuelve la clave de la copia.",
        { clave: key },
      ),
      spec("usar_preset", "Reemplaza el contenido de un campo por un contenido listo y fija quién lo llena.", {
        clave: key,
        preset: { type: "string", description: "Clave del contenido listo según listar_presets." },
      }),
      spec(
        "crear_tabla_repetible",
        'Crea una tabla repetible nueva (el docente agrega filas) y devuelve su clave. Después póngala en un campo Carrera con <div data-block="CLAVE"></div> (agregar_campo o cambiar_contenido_campo).',
        {
          titulo: { type: "string", description: "Título de la tabla, por ejemplo «Prácticas de laboratorio»." },
          fila: { type: "string", description: "Nombre de cada fila en singular, por ejemplo «práctica»; el botón dice «Agregar práctica»." },
          minimo: { type: "integer", description: "Filas mínimas (0 a 100)." },
          maximo: { type: "integer", description: "Filas máximas (1 a 100)." },
          al_empezar: { type: "integer", description: "Filas con las que empieza, entre el mínimo y el máximo." },
          columnas: {
            type: "array",
            description: "Columnas en orden (1 a 24).",
            items: {
              type: "object",
              properties: {
                nombre: { type: "string" },
                tipo: { type: "string", enum: Object.keys(CELL_TYPES), description: "texto (hasta 1000 caracteres), opcion (elegir una de «opciones») o numero (hasta 999,99)." },
                obligatoria: { type: "boolean", description: "Si es verdadera, el docente no puede enviar con esa celda vacía en alguna fila." },
                opciones: { type: "array", items: { type: "string" }, description: "Solo para «opcion»; vacío en los otros tipos." },
              },
              required: ["nombre", "tipo", "obligatoria", "opciones"],
              additionalProperties: false,
            },
          },
        },
      ),
      spec(
        "mostrar_solo_si",
        'Muestra un campo solo si una respuesta anterior de elegir una o varias tiene alguna de las opciones dadas (si no, el docente no lo ve, no se le exige y no se imprime). Con «respuesta» vacía quita la condición. Para una sola respuesta use "showIf" en su data-response.',
        {
          clave: key,
          respuesta: { type: "string", description: 'Identificador ("id" en data-response) de la respuesta anterior, por ejemplo «usa_laboratorio». Vacío quita la condición.' },
          opciones: { type: "array", items: { type: "string" }, description: "Opciones de esa respuesta que muestran el campo, por su texto («Sí») o su clave («o1»). Vacío si quita la condición." },
        },
      ),
      spec(
        "limite_caracteres",
        "Pone un límite de caracteres a lo que el docente escribe en un campo Carrera: suma su texto libre y sus respuestas de texto; no cuentan las tablas repetibles, el texto fijo ni lo que respondió Coordinación. Con «limite» 0 quita el límite.",
        { clave: key, limite: { type: "integer", description: "Caracteres permitidos, de 1 a 50000. 0 quita el límite." } },
      ),
      spec("validar_borrador", "Revisa el borrador con las mismas reglas de guardar y lista los cambios hechos.", {}),
      spec("responder", "Termina el turno con un mensaje para el administrador: resume los cambios del borrador o responde su pregunta.", { mensaje: { type: "string" } }),
      spec("preguntar", "Termina el turno pidiendo una aclaración cuando el pedido es ambiguo.", { pregunta: { type: "string" } }),
    ]
    return this.locked() ? specs.filter((item) => READ_ONLY.includes(item.name)) : specs
  }

  async execute(call: AiToolCall): Promise<ToolResult> {
    if (call.arguments === null) return toolError("Los argumentos no son un objeto JSON válido.")
    if (this.locked() && !READ_ONLY.includes(call.name)) return toolError("El periodo académico está abierto: no se pueden proponer cambios a la plantilla.")
    const args = call.arguments
    const draft = this.draft
    const apply = (message: string, change: () => string) => toolOk({ ok: true, mensaje: message, clave: change() })
    try {
      switch (call.name) {
        case "ver_plantilla":
          return toolOk({ secciones: draft.overview() })
        case "ver_campo":
          return toolOk(draft.field(stringArg(args, "clave")))
        case "listar_presets":
          return toolOk({
            presets: list(draft.definition().presets).map((preset) => {
              const item = record(preset)
              return { preset: item.key, nombre: item.label, quien_llena: item.quien_llena }
            }),
          })
        case "listar_variables":
          return toolOk({ variables: variableCatalog(draft.baseDefinition()).map((variable) => ({ clave: variable.key, nombre: variable.label })) })
        case "ver_estado":
          return toolOk(this.process)
        case "agregar_seccion":
          return apply("Sección agregada.", () => draft.addSectionAfter(stringArg(args, "titulo"), stringArg(args, "orientacion"), stringArg(args, "despues_de")))
        case "renombrar_seccion":
          return apply("Sección renombrada.", () => draft.renameSection(stringArg(args, "clave"), stringArg(args, "titulo")))
        case "cambiar_orientacion_seccion":
          return apply("Orientación cambiada.", () => draft.orientSection(stringArg(args, "clave"), stringArg(args, "orientacion")))
        case "mover_seccion":
          return apply("Sección movida.", () => draft.moveSectionAfter(stringArg(args, "clave"), stringArg(args, "despues_de")))
        case "renumerar":
          return toolOk({ ok: true, renombrados: draft.renumber() })
        case "quitar_seccion":
          return apply("Sección quitada.", () => draft.removeSection(stringArg(args, "clave")))
        case "agregar_campo":
          return apply("Campo agregado.", () =>
            draft.addFieldAfter(stringArg(args, "seccion"), stringArg(args, "nombre"), stringArg(args, "quien_llena"), stringArg(args, "contenido_html"), stringArg(args, "despues_de")),
          )
        case "renombrar_campo":
          return apply("Campo renombrado.", () => draft.renameField(stringArg(args, "clave"), stringArg(args, "nombre")))
        case "cambiar_responsable_campo":
          return apply("Responsable cambiado.", () => draft.assignField(stringArg(args, "clave"), stringArg(args, "quien_llena")))
        case "cambiar_contenido_campo":
          return apply("Contenido reemplazado.", () => draft.rewriteField(stringArg(args, "clave"), stringArg(args, "contenido_html")))
        case "mover_campo":
          return apply("Campo movido.", () => draft.moveFieldAfter(stringArg(args, "clave"), stringArg(args, "seccion"), stringArg(args, "despues_de")))
        case "quitar_campo":
          return apply("Campo quitado.", () => draft.removeField(stringArg(args, "clave")))
        case "duplicar_campo":
          return apply("Campo duplicado.", () => draft.duplicateField(stringArg(args, "clave")))
        case "duplicar_seccion":
          return apply("Sección duplicada.", () => draft.duplicateSection(stringArg(args, "clave")))
        case "usar_preset":
          return apply("Contenido listo aplicado.", () => draft.applyPreset(stringArg(args, "clave"), stringArg(args, "preset")))
        case "crear_tabla_repetible":
          return apply('Tabla repetible creada. Póngala en un campo con <div data-block="CLAVE"></div>.', () => draft.createTable(tableDesign(args)))
        case "mostrar_solo_si":
          return apply("Condición actualizada.", () => draft.showFieldIf(stringArg(args, "clave"), stringArg(args, "respuesta"), stringsArg(args, "opciones")))
        case "limite_caracteres":
          return apply("Límite actualizado.", () => draft.limitField(stringArg(args, "clave"), integerArg(args, "limite")))
        case "validar_borrador":
          return toolOk(await this.validation())
        case "responder":
          return toolFinish(ANSWER, messageArg(args, "mensaje"))
        case "preguntar":
          return toolFinish(QUESTION, messageArg(args, "pregunta"))
        default:
          return toolError(`No existe la función «${call.name}».`)
      }
    } catch (error) {
      if (error instanceof TemplateDraftError) return toolError(error.message)
      throw error
    }
  }

  async validation(): Promise<{ valido: boolean; errores: string[]; cambios: string[] }> {
    const errors = this.draft.changed() ? (await this.validator.errors(this.draft)).filter((error) => !this.preexisting.includes(error)) : []
    return { valido: errors.length === 0, errores: errors, cambios: this.draft.changes() }
  }
}
