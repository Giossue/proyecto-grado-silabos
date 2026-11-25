import { getTeacherHistory, getTeacherHistoryCareer, getTeacherSyllabi, getTeacherSyllabus } from "@/api/syllabi"

export type TeacherSyllabiFilters = { q: string; state: string }

export const teacherKeys = {
  all: ["teacher"] as const,
  syllabi: (page: number, filters: TeacherSyllabiFilters) => ["teacher", "syllabi", page, filters] as const,
  syllabus: (syllabusId: string) => ["teacher", "syllabus", syllabusId] as const,
  history: () => ["teacher", "history"] as const,
  historyCareer: (career: string) => ["teacher", "history", career] as const,
}

export const teacherSyllabiQuery = (page: number, filters: TeacherSyllabiFilters) => ({
  queryKey: teacherKeys.syllabi(page, filters),
  queryFn: () => getTeacherSyllabi({ ...filters, page }),
})

export const teacherSyllabusQuery = (syllabusId: string) => ({
  queryKey: teacherKeys.syllabus(syllabusId),
  queryFn: () => getTeacherSyllabus(syllabusId),
})

export const teacherHistoryQuery = () => ({ queryKey: teacherKeys.history(), queryFn: getTeacherHistory })

export const teacherHistoryCareerQuery = (career: string) => ({
  queryKey: teacherKeys.historyCareer(career),
  queryFn: () => getTeacherHistoryCareer(career),
})
