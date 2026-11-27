"use client"

import { useMemo, useState } from "react"
import { ApiError } from "@/api/client"
import { createSubjectRequirement, updateSubjectLayout } from "@/api/career-academics"
import type { CurriculumRequirement } from "@/components/domain/academic/curriculum/curriculumCanvasLayout"
import type { PendingConnection } from "@/components/domain/academic/curriculum/CurriculumRelationPicker"
import { toast } from "@/lib/toast"
import type { CurriculumBuilderSubject } from "@/types/academic"

const SAVED_MESSAGE = "Cambios de la malla guardados"

/** What the editor has moved or connected and not saved yet: the wanted order of each touched cycle and the new prerequisites. */
type Edits = { curriculumId: string; order: Record<number, string[]>; links: PendingConnection[] }

type CurriculumDraftOptions = {
  curriculumId: string
  subjects: CurriculumBuilderSubject[]
  requirements: CurriculumRequirement[]
  /** Runs once everything is saved. The draft is cleared after it ends, so reloading here never shows the old malla in between. */
  onSaved: (message: string) => Promise<void> | void
  onFailed: () => Promise<void> | void
}

export type CurriculumDraft = {
  /** The subjects as the editor shows them: the saved ones with the positions chosen so far. */
  subjects: CurriculumBuilderSubject[]
  /** The saved prerequisites followed by the ones still to be saved. */
  requirements: CurriculumRequirement[]
  dirty: boolean
  saving: boolean
  move: (subjectId: string, index: number) => void
  connect: (connection: PendingConnection) => void
  /** Drops a prerequisite that was never saved; false when it is a saved one. */
  removePending: (requirementId: string) => boolean
  discard: () => void
  save: () => Promise<void>
}

const noEdits = (curriculumId: string): Edits => ({ curriculumId, order: {}, links: [] })

const PENDING_PREFIX = "pending:"

const pendingId = (link: PendingConnection): string => `${PENDING_PREFIX}${link.sourceId}:${link.targetId}`

export const isPendingRequirement = (requirementId: string): boolean => requirementId.startsWith(PENDING_PREFIX)

const cycleList = (subjects: CurriculumBuilderSubject[], cycle: number): CurriculumBuilderSubject[] =>
  subjects
    .filter((subject) => subject.cycle === cycle)
    .sort((left, right) => (left.position === right.position ? left.name.localeCompare(right.name) : left.position - right.position))

const idsOf = (subjects: CurriculumBuilderSubject[]): string[] => subjects.map((subject) => subject.id)

/** The cycle in the wanted order. Subjects added after it was chosen keep their saved order at the end. */
const arrange = (saved: CurriculumBuilderSubject[], wanted: string[]): CurriculumBuilderSubject[] => {
  const rank = (subject: CurriculumBuilderSubject): number => {
    const index = wanted.indexOf(subject.id)

    return index === -1 ? wanted.length : index
  }

  return saved.toSorted((left, right) => rank(left) - rank(right))
}

const place = (subjects: CurriculumBuilderSubject[], order: Edits["order"]): CurriculumBuilderSubject[] => {
  const positions = new Map(
    Object.entries(order).flatMap(([cycle, wanted]) => arrange(cycleList(subjects, Number(cycle)), wanted).map((subject, index) => [subject.id, index] as const)),
  )

  return positions.size === 0 ? subjects : subjects.map((subject) => ({ ...subject, position: positions.get(subject.id) ?? subject.position }))
}

/** The fewest moves that turn the saved order of a cycle into the wanted one: the longest run already in order stays put. */
export const layoutMoves = (saved: string[], wanted: string[]): { subjectId: string; position: number }[] => {
  const longest = (chains: number[][]): number[] => chains.reduce<number[]>((best, chain) => (chain.length > best.length ? chain : best), [])
  const chains: number[][] = []
  for (const rank of saved.map((id) => wanted.indexOf(id))) chains.push([...longest(chains.filter((chain) => chain.at(-1)! < rank)), rank])
  const kept = new Set(longest(chains))
  const current = [...saved]

  return wanted.flatMap((subjectId, rank) => {
    if (kept.has(rank)) return []
    current.splice(current.indexOf(subjectId), 1)
    const position = rank === 0 ? 0 : current.indexOf(wanted[rank - 1]!) + 1
    current.splice(position, 0, subjectId)

    return [{ subjectId, position }]
  })
}

export function useCurriculumDraft({ curriculumId, subjects, requirements, onSaved, onFailed }: CurriculumDraftOptions): CurriculumDraft {
  const [edits, setEdits] = useState(() => noEdits(curriculumId))
  const [saving, setSaving] = useState(false)
  if (edits.curriculumId !== curriculumId) setEdits(noEdits(curriculumId))

  const shown = useMemo(() => place(subjects, edits.order), [subjects, edits.order])
  const cycleOf = (subjectId: string): number | null => subjects.find((subject) => subject.id === subjectId)?.cycle ?? null
  const saved = (link: PendingConnection): boolean => requirements.some((item) => item.requirement_id === link.sourceId && item.subject_id === link.targetId)

  // A reload may delete a subject, move it to another cycle or bring a prerequisite already saved: those stop being pending.
  const links = useMemo(() => {
    const cycles = new Map(subjects.map((subject) => [subject.id, subject.cycle]))

    return edits.links.filter((link) => {
      const from = cycles.get(link.sourceId)
      const to = cycles.get(link.targetId)

      return typeof from === "number" && typeof to === "number" && from < to && !requirements.some((item) => item.requirement_id === link.sourceId && item.subject_id === link.targetId)
    })
  }, [subjects, requirements, edits.links])

  const allRequirements = useMemo(
    () => (links.length === 0 ? requirements : [...requirements, ...links.map((link) => ({ id: pendingId(link), requirement_id: link.sourceId, subject_id: link.targetId }))]),
    [requirements, links],
  )

  const moves = Object.entries(edits.order).flatMap(([key, wanted]) => {
    const cycle = Number(key)
    const list = cycleList(subjects, cycle)

    return layoutMoves(idsOf(list), idsOf(arrange(list, wanted))).map((move) => ({ subject_id: move.subjectId, cycle, position: move.position }))
  })
  const dirty = moves.length > 0 || links.length > 0

  const move = (subjectId: string, index: number): void => {
    const cycle = cycleOf(subjectId)
    // Anything chosen while saving would be dropped when the save clears the draft.
    if (saving || cycle === null) return
    const wanted = idsOf(cycleList(shown, cycle))
    const from = wanted.indexOf(subjectId)
    if (index < 0 || index >= wanted.length || index === from) return
    wanted.splice(from, 1)
    wanted.splice(index, 0, subjectId)
    const back = idsOf(cycleList(subjects, cycle)).every((id, position) => wanted[position] === id)
    setEdits((current) => {
      const order = { ...current.order, [cycle]: wanted }
      if (back) delete order[cycle]

      return { ...current, order }
    })
  }

  const connect = (link: PendingConnection): void => {
    if (saving) return
    const from = cycleOf(link.sourceId)
    const to = cycleOf(link.targetId)
    if (from === null || to === null || from >= to) {
      toast.error("Un prerrequisito debe estar en un ciclo anterior")
      return
    }
    if (saved(link)) return
    setEdits((current) => (current.links.some((item) => pendingId(item) === pendingId(link)) ? current : { ...current, links: [...current.links, link] }))
  }

  const removePending = (requirementId: string): boolean => {
    if (!isPendingRequirement(requirementId)) return false
    setEdits((current) => ({ ...current, links: current.links.filter((link) => pendingId(link) !== requirementId) }))

    return true
  }

  const discard = (): void => setEdits(noEdits(curriculumId))

  const save = async (): Promise<void> => {
    if (saving || !dirty) return
    setSaving(true)
    try {
      for (const payload of moves) await updateSubjectLayout(curriculumId, payload)
      for (const link of links) await createSubjectRequirement(curriculumId, { requirement_id: link.sourceId, subject_id: link.targetId })
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "No se pudieron guardar los cambios de la malla")
      // Whatever did get saved stops being pending once the malla is read again.
      await onFailed()
      setSaving(false)
      return
    }
    await onSaved(SAVED_MESSAGE)
    discard()
    setSaving(false)
  }

  return { subjects: shown, requirements: allRequirements, dirty, saving, move, connect, removePending, discard, save }
}
