import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useCurriculumSubjectFieldValues } from "@/composables/useCurriculumSubjectFieldValues"
import type { CurriculumBuilderSubject, FixedSubjectField } from "@/types/academic"

const field = (system_key: string, type: FixedSubjectField["type"] = "entero"): FixedSubjectField =>
  ({ id: system_key, key: system_key, label: system_key, type, system_key, system_label: system_key, position: 0, visible_on_card: true, totalizable: true }) as FixedSubjectField

const definitions = [field("horas_ac"), field("horas_pae"), field("horas_aa"), field("horas_totales"), field("creditos", "numero"), field("practica", "booleano")]

const subject = (values: Record<string, number | string | null>) => ({ id: "s1", system_values: values }) as unknown as CurriculumBuilderSubject

describe("useCurriculumSubjectFieldValues", () => {
  it("toma los valores de la materia y suma las horas en el total", () => {
    const { result } = renderHook(() => useCurriculumSubjectFieldValues(subject({ horas_ac: 64, horas_pae: "32", creditos: "4.5" }), definitions))

    expect(result.current.valueFor(definitions[0]!)).toBe(64)
    expect(result.current.valueFor(definitions[1]!)).toBe(32)
    expect(result.current.valueFor(definitions[2]!)).toBe("")
    expect(result.current.valueFor(definitions[4]!)).toBe(4.5)
    expect(result.current.totalHours).toBe(96)
    expect(result.current.valueFor(definitions[3]!)).toBe(96)
  })

  it("al escribir recalcula el total y el total no se puede cambiar a mano", () => {
    const { result } = renderHook(() => useCurriculumSubjectFieldValues(null, definitions))

    act(() => result.current.updateValue(definitions[0]!, "10"))
    act(() => result.current.updateValue(definitions[2]!, 5))
    act(() => result.current.updateValue(definitions[3]!, 999))
    act(() => result.current.updateValue(definitions[5]!, true))

    expect(result.current.totalHours).toBe(15)
    expect(result.current.valueFor(definitions[3]!)).toBe(15)
    expect(result.current.valueFor(definitions[5]!)).toBe("true")
  })

  it("vuelve a los valores de otra materia cuando cambia", () => {
    const { result, rerender } = renderHook(({ current }) => useCurriculumSubjectFieldValues(current, definitions), {
      initialProps: { current: subject({ horas_ac: 1 }) },
    })
    act(() => result.current.updateValue(definitions[0]!, "50"))
    expect(result.current.totalHours).toBe(50)

    rerender({ current: subject({ horas_ac: 8 }) })
    expect(result.current.totalHours).toBe(8)
  })
})
