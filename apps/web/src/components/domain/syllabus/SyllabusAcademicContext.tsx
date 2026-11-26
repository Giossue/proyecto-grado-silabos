import { Card, CardContent } from "@/components/ui/card"

type ContextGroup = { title: string; items: { label: string; value: string }[] }

const PENDING = "Pendiente de Coordinación"
const TEACHER_PENDING = "Lo completa el docente"

const UNIT_MARKS: [string, string][] = [
  ["marca_unidad_basica", "Unidad básica"],
  ["marca_unidad_profesional", "Unidad profesional"],
  ["marca_unidad_titulacion", "Unidad de integración curricular"],
]

const number = (raw: string): string => (/^\d+\.\d+$/.test(raw) ? raw.replace(/\.?0+$/, "") : raw)

export function SyllabusAcademicContext({ variables }: { variables: Record<string, string> }) {
  const value = (key: string): string => number(variables[key]?.trim() ?? "") || PENDING
  const written = (key: string): string => variables[key]?.trim() || TEACHER_PENDING
  const curricularUnit = variables.unidad_organizacion_curricular?.trim() || UNIT_MARKS.find(([key]) => variables[key]?.trim())?.[1] || PENDING
  const groups: ContextGroup[] = [
    {
      title: "Asignatura",
      items: [
        { label: "Nombre", value: value("nombre_asignatura") },
        { label: "Código", value: value("codigo_asignatura") },
        { label: "Carrera", value: value("nombre_carrera") },
        { label: "Facultad", value: value("nombre_facultad") },
        { label: "Unidad de organización curricular", value: curricularUnit },
        { label: "Prerrequisitos", value: value("prerrequisitos_asignatura") },
        { label: "Correquisitos", value: written("correquisitos_asignatura") },
      ],
    },
    {
      title: "Oferta académica",
      items: [
        { label: "Período académico", value: value("nombre_periodo_academico") },
        { label: "Campus", value: written("nombre_campus") },
        { label: "Modalidad", value: value("modalidad_estudio") },
        { label: "Ciclo", value: value("ciclo_asignatura") },
        { label: "Paralelo", value: value("codigo_paralelo") },
        { label: "Jornada", value: value("jornada_paralelo") },
      ],
    },
    {
      title: "Carga académica",
      items: [
        { label: "Horas ACD", value: value("horas_docencia") },
        { label: "Horas APE", value: value("horas_practicas") },
        { label: "Horas AA", value: value("horas_autonomas") },
        { label: "Total de horas", value: value("horas_totales") },
        { label: "Créditos", value: value("creditos_asignatura") },
      ],
    },
    {
      title: "Docente",
      items: [
        { label: "Nombre", value: value("nombre_docente") },
        { label: "Correo", value: value("correo_docente") },
      ],
    },
  ]

  return (
    <Card>
      <CardContent className="grid gap-6 md:grid-cols-2 2xl:grid-cols-4">
        {groups.map((group) => (
          <section key={group.title} className="flex min-w-0 flex-col gap-3">
            <h3 className="text-sm font-medium">{group.title}</h3>
            <dl className="flex flex-col gap-3">
              {group.items.map((item) => (
                <div key={item.label} className="min-w-0">
                  <dt className="text-xs font-semibold">{item.label}</dt>
                  <dd className="text-sm break-words">{item.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </CardContent>
    </Card>
  )
}
