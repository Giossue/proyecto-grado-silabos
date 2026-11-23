import { parseDate, type CalendarDate } from "@internationalized/date"
import { useMemo } from "react"
import { useSession } from "@/state/session"

const localToday = (): string => {
  const now = new Date()

  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

export const useInstitutionToday = (): string => useSession().session?.institution?.today ?? localToday()

export const useInstitutionCalendarDate = (): CalendarDate => {
  const today = useInstitutionToday()

  return useMemo(() => parseDate(today), [today])
}
