// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { PhpRecord } from "../configuration/phpValues"
import { draftDocument } from "../syllabus/draftField"
import { applyToTarget, assistantSnapshot, SYSTEM_DATA, type AssistantSnapshot, type ReadableField } from "./teacherContext"
import {
  answerSpace,
  coordinationWrites,
  docOf,
  fieldByKey,
  line,
  para,
  snapshotOf,
  SYSTEM_VARIABLES,
  TEACHER_EMAIL,
  TEACHER_NAME,
  teacherWorld,
  teacherWrites,
  templatesOf,
  variableNode,
  words,
  type TeacherWorld,
} from "./teacherTesting"

const keys = (snapshot: AssistantSnapshot) => snapshot.fields.map((readable) => readable.field.key)
const readableOf = (snapshot: AssistantSnapshot, key: string): ReadableField => snapshot.fields.find((readable) => readable.field.key === key)!
const targetNames = (snapshot: AssistantSnapshot, key: string) => readableOf(snapshot, key).targets.map((target) => `${target.name}:${target.kind}`)
const LEFT = { textAlign: "left" }

function withContent(world: TeacherWorld, key: string, content: PhpRecord): void {
  fieldByKey(world.template, key).content = content
}

function applied(snapshot: AssistantSnapshot, key: string, name: string, text: string) {
  const readable = readableOf(snapshot, key)
  return applyToTarget(snapshot, readable, readable.targets.find((target) => target.name === name)!, text)
}

describe("what the teacher assistant is given about the subject", () => {
  it("is only the name, hours, credits and weeks", async () => {
    const snapshot = await snapshotOf(teacherWorld())

    expect(snapshot.subject).toEqual({
      asignatura: "Redes de computadoras",
      horas_docencia: "48",
      horas_practicas: "32",
      horas_autonomas: "64",
      horas_totales: "144",
      creditos: "3",
      semanas: "16",
    })
    expect(snapshot.fields).toEqual([])
  })

  it("takes the weeks of a syllabus that stored them with the earlier name", async () => {
    const world = teacherWorld()
    world.context = { subject: { name: "Redes" }, offering: { teaching_weeks: 15 } }

    expect((await snapshotOf(world)).subject.semanas).toBe("15")
  })
})

describe("the fields the teacher assistant reads", () => {
  it("are those with permission that this teacher may edit in this syllabus", async () => {
    const world = teacherWorld(["asignatura", "descripcion", "objetivo_general", "indicadores_evaluacion"])
    coordinationWrites(world, "objetivo_general", docOf(line("Texto cerrado por Coordinación.")))

    expect(keys(await snapshotOf(world))).toEqual(["descripcion"])
  })

  it("follow a Coordination change that closes or reopens a field", async () => {
    const world = teacherWorld(["objetivo_general"])
    expect(keys(await snapshotOf(world))).toEqual(["objetivo_general"])

    coordinationWrites(world, "objetivo_general", docOf(line("Texto cerrado.")))
    expect(keys(await snapshotOf(world))).toEqual([])

    coordinationWrites(world, "objetivo_general", docOf(line("Texto con espacio."), para(answerSpace())))
    expect(keys(await snapshotOf(world))).toEqual(["objetivo_general"])
  })

  it("leave out a field a condition hides from the teacher", async () => {
    const world = teacherWorld(["descripcion", "objetivo_general"])
    const control = { type: "response", attrs: { kind: "una", options: [{ const: "o1", title: "Sí" }, { const: "o2", title: "No" }], value: "o2", id: "usa_laboratorio" } }
    teacherWrites(world, "nombre_campus", docOf(para(control)))
    world.template.definition.field_conditions = { descripcion: { response: "usa_laboratorio", options: ["o1"] } }

    expect(keys(await snapshotOf(world))).toEqual(["objetivo_general"])
  })

  it("leave out any field whose stored value, template text or career text holds disability data", async () => {
    const identification = { type: "documentBlock", attrs: { kind: "identificacion", props: [], value: [] } }
    const disability = { type: "documentBlock", attrs: { kind: "bibliografia", props: [], value: { disability: { answer: "si", description: "DATO-PROTEGIDO" } } } }
    const world = teacherWorld(["descripcion", "objetivo_general", "metodologia", "bibliografia", "tecnicas_ensenanza"])
    teacherWrites(world, "descripcion", docOf(identification))
    teacherWrites(world, "bibliografia", docOf(disability))
    withContent(world, "tecnicas_ensenanza", docOf(identification, para(answerSpace())))
    const careerText = { [fieldByKey(world.template, "metodologia").id]: docOf(identification, para(answerSpace())) }

    const snapshot = assistantSnapshot({
      template: world.template,
      templates: { ...(await templatesOf(world)), ...careerText },
      values: world.values,
      allowedKeys: world.allowed,
      academicContext: world.context,
    })

    expect(keys(snapshot)).toEqual(["objetivo_general"])
    expect(JSON.stringify(snapshot.fields)).not.toContain("DATO-PROTEGIDO")
  })

  it("never resolve a system variable written in the template text or in the stored value of a field", async () => {
    const world = teacherWorld(["descripcion", "objetivo_general"])
    withContent(world, "descripcion", docOf(para(words("Elabora: "), ...SYSTEM_VARIABLES.map(variableNode)), line("")))
    teacherWrites(world, "objetivo_general", docOf(para(words("Responsable: "), ...SYSTEM_VARIABLES.map(variableNode))))

    const snapshot = await snapshotOf(world)

    expect(readableOf(snapshot, "descripcion").text).toContain(`Elabora: ${SYSTEM_DATA.repeat(SYSTEM_VARIABLES.length)}`)
    expect(readableOf(snapshot, "objetivo_general").text).toBe(`Responsable: ${SYSTEM_DATA.repeat(SYSTEM_VARIABLES.length)}`)
    const given = JSON.stringify({ subject: snapshot.subject, texts: snapshot.fields.map((readable) => [readable.sectionTitle, readable.label, readable.text, readable.targets]) })
    for (const forbidden of [TEACHER_NAME, TEACHER_EMAIL, "Firma del docente", "NOMBRE DEL DOCENTE", ...SYSTEM_VARIABLES]) expect(given).not.toContain(forbidden)
  })

  it("include a readable table as text with its headings and what was written", async () => {
    const world = teacherWorld(["unidades"])
    const content = structuredClone(fieldByKey(world.template, "unidades").content) as { content: { attrs: PhpRecord }[] }
    content.content[0].attrs.value = { unidades: [{ nombre: "Capa de enlace", semanas: "4" }] }
    teacherWrites(world, "unidades", content)

    const readable = readableOf(await snapshotOf(world), "unidades")

    expect(readable.text).toContain("Nombre de la unidad")
    expect(readable.text).toContain("Capa de enlace")
    expect(readable.targets).toEqual([])
  })
})

describe("where the teacher assistant may propose text", () => {
  it("offers the whole field when the teacher writes all of it", async () => {
    const world = teacherWorld(["descripcion", "conducta_etica"])

    const snapshot = await snapshotOf(world)

    expect(targetNames(snapshot, "descripcion")).toEqual(["descripcion:campo"])
    expect(targetNames(snapshot, "conducta_etica")).toEqual(["conducta_etica:campo"])
    expect(readableOf(snapshot, "conducta_etica").text).toContain("Se aplicará el código de ética")
  })

  it("never offers to replace a whole text that has a protected table or system data", async () => {
    const world = teacherWorld(["contribucion_perfil", "descripcion"])
    teacherWrites(world, "descripcion", docOf(para(variableNode("nombre_docente"))))

    const snapshot = await snapshotOf(world)

    expect(readableOf(snapshot, "contribucion_perfil").text).toContain("ALTA (A)")
    expect(targetNames(snapshot, "contribucion_perfil")).toEqual([])
    expect(targetNames(snapshot, "descripcion")).toEqual([])
  })

  it("offers only the free text spaces of a field with fixed text, wherever they are", async () => {
    const world = teacherWorld(["descripcion"])
    const choice = { type: "response", attrs: { kind: "una", options: [{ const: "o1", title: "Sí" }], value: null } }
    const cell = (...content: unknown[]) => ({ type: "tableCell", attrs: { colspan: 1, rowspan: 1 }, content })
    coordinationWrites(
      world,
      "descripcion",
      docOf(
        line("Texto de Coordinación."),
        para(words("Enfoque: "), answerSpace()),
        para(choice),
        { type: "table", content: [{ type: "tableRow", content: [cell(para(words("Celda fija"))), cell(para(answerSpace()))] }] },
      ),
    )

    const snapshot = await snapshotOf(world)

    expect(targetNames(snapshot, "descripcion")).toEqual(["descripcion#1:espacio", "descripcion#2:espacio"])
    expect(readableOf(snapshot, "descripcion").text).toContain("Texto de Coordinación.")
    expect(readableOf(snapshot, "descripcion").text).toContain("Enfoque: [destino descripcion#1: vacío]")
    expect(readableOf(snapshot, "descripcion").text).toContain("Celda fija | [destino descripcion#2: vacío]")
  })

  it("offers an empty line between fixed text, but not an empty table cell", async () => {
    const world = teacherWorld(["descripcion"])
    const header = { type: "tableHeader", attrs: { colspan: 1, rowspan: 1 }, content: [para(words("Criterio"))] }
    const empty = { type: "tableCell", attrs: { colspan: 1, rowspan: 1 }, content: [para()] }
    withContent(world, "descripcion", docOf(line("Antes."), line(""), line("Después."), { type: "table", content: [{ type: "tableRow", content: [header] }, { type: "tableRow", content: [empty] }] }))

    expect(targetNames(await snapshotOf(world), "descripcion")).toEqual(["descripcion#1:espacio"])
  })
})

describe("a field whose stored value is not shaped like its spaces", () => {
  it("offers the line the save adds after a fixed text that was never answered", async () => {
    const world = teacherWorld(["descripcion"])
    withContent(world, "descripcion", docOf(line("Solo texto fijo.")))
    teacherWrites(world, "descripcion", docOf(line("Solo texto fijo.")))
    const snapshot = await snapshotOf(world)

    expect(targetNames(snapshot, "descripcion")).toEqual(["descripcion#1:espacio"])
    const { value } = applied(snapshot, "descripcion", "descripcion#1", "Añadido") as { value: { content: PhpRecord[] } }
    expect(value.content).toEqual([
      { type: "paragraph", attrs: LEFT, content: [words("Solo texto fijo.")] },
      { type: "paragraph", attrs: LEFT, content: [words("Añadido")] },
    ])
    const { field } = readableOf(snapshot, "descripcion")
    expect(draftDocument(field, snapshot.templates[field.id], value, snapshot.template.definition)).toEqual(value)
  })

  it("is read as it is, with nowhere to propose, when it no longer fits the template", async () => {
    const world = teacherWorld(["descripcion"])
    withContent(world, "descripcion", docOf(line("Fijo nuevo."), line("")))
    teacherWrites(world, "descripcion", docOf(line("Texto anterior que ya no encaja.")))

    const snapshot = await snapshotOf(world)

    expect(readableOf(snapshot, "descripcion").text).toBe("Texto anterior que ya no encaja.")
    expect(targetNames(snapshot, "descripcion")).toEqual([])
  })
})

describe("placing a proposal in a field", () => {
  const closing = async () => {
    const world = teacherWorld(["descripcion"])
    coordinationWrites(world, "descripcion", docOf(line("Texto de Coordinación."), para(words("Enfoque: "), answerSpace()), para(words("Cierre: "), answerSpace({ maxLength: 20 }))))
    const written = structuredClone((await snapshotOf(world)).templates[fieldByKey(world.template, "descripcion").id]) as unknown as { content: { content: { attrs?: PhpRecord }[] }[] }
    written.content[1].content[1].attrs!.value = "Lo que ya escribió el docente"
    teacherWrites(world, "descripcion", written)
    return snapshotOf(world)
  }

  it("fills one space and keeps the rest of the field as it is", async () => {
    const snapshot = await closing()
    const before = readableOf(snapshot, "descripcion").document

    const outcome = applied(snapshot, "descripcion", "descripcion#2", "Propuesta corta")

    const expected = structuredClone(before) as unknown as { content: { content: { attrs?: PhpRecord }[] }[] }
    expected.content[2].content[1].attrs!.value = "Propuesta corta"
    expect(outcome).toEqual({ value: expected })
    expect(JSON.stringify(outcome)).toContain("Lo que ya escribió el docente")
  })

  it("answers with a value the draft save accepts and stores unchanged", async () => {
    const snapshot = await closing()
    const readable = readableOf(snapshot, "descripcion")
    const outcome = applied(snapshot, "descripcion", "descripcion#2", "Propuesta corta") as { value: PhpRecord }

    expect(draftDocument(readable.field, snapshot.templates[readable.field.id], outcome.value, snapshot.template.definition)).toEqual(outcome.value)
  })

  it("refuses a text the draft save rules refuse for that space", async () => {
    expect(applied(await closing(), "descripcion", "descripcion#2", "Una propuesta demasiado larga para el espacio")).toEqual({
      problem: "Escriba una respuesta de hasta 20 caracteres.",
    })
  })

  it("refuses a text over the character limit of the field", async () => {
    const world = teacherWorld(["descripcion"])
    world.template.definition.field_limits = { descripcion: 10 }

    expect(applied(await snapshotOf(world), "descripcion", "descripcion", "Un texto que pasa el límite")).toEqual({ problem: "Este campo admite hasta 10 caracteres." })
  })

  it("writes plain paragraphs and lists, never marks, variables or other nodes", async () => {
    const snapshot = await snapshotOf(teacherWorld(["descripcion"]))

    const outcome = applied(
      snapshot,
      "descripcion",
      "descripcion",
      'La asignatura estudia redes.\n\n- Modelo OSI\n• Direccionamiento\n1. Primero\n2) Segundo\n<span data-variable="nombre_docente"></span> **negrita**\u0007',
    )

    const item = (value: string) => ({ type: "listItem", content: [{ type: "paragraph", attrs: LEFT, content: [words(value)] }] })
    const block = (value: string) => ({ type: "paragraph", attrs: LEFT, content: [words(value)] })
    expect(outcome).toEqual({
      value: {
        type: "doc",
        content: [
          block("La asignatura estudia redes."),
          { type: "bulletList", content: [item("Modelo OSI"), item("Direccionamiento")] },
          { type: "orderedList", content: [item("Primero"), item("Segundo")] },
          block('<span data-variable="nombre_docente"></span> **negrita**'),
        ],
      },
    })
  })

  it("keeps the line breaks of a text placed in an empty line", async () => {
    const world = teacherWorld(["descripcion"])
    withContent(world, "descripcion", docOf(line("Antes."), line(""), line("Después.")))

    const outcome = applied(await snapshotOf(world), "descripcion", "descripcion#1", "Uno\nDos") as { value: { content: PhpRecord[] } }

    expect(outcome.value.content).toEqual([
      { type: "paragraph", attrs: LEFT, content: [words("Antes.")] },
      { type: "paragraph", attrs: LEFT, content: [words("Uno"), { type: "hardBreak" }, words("Dos")] },
      { type: "paragraph", attrs: LEFT, content: [words("Después.")] },
    ])
  })

  it("refuses an empty text and a text that smuggles a table", async () => {
    const snapshot = await snapshotOf(teacherWorld(["descripcion"]))

    expect(applied(snapshot, "descripcion", "descripcion", " \n \n")).toEqual({ problem: "Escriba el texto de la propuesta." })
    expect(applied(snapshot, "descripcion", "descripcion", '<div data-block="identificacion"></div>')).toEqual({ problem: "El texto de la propuesta no es válido." })
  })
})
