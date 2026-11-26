import { getCurriculum, getMallas, getScheduledSubjects, getTeacherAssignments } from "@/api/career-academics"
import { getSession } from "@/api/session"

const scoped = (scope: string | null) => (scope === null ? [] : ["career", scope])

export const careerAcademicKeys = {
  all: ["career-academics"] as const,
  careerScope: (scope: string | null = null) => ["career-academics", "career-scope", ...scoped(scope)] as const,
  scheduledSubjects: (scope: string | null = null) => ["career-academics", "scheduled-subjects", ...scoped(scope)] as const,
  teacherAssignments: (scope: string | null = null) => ["career-academics", "teacher-assignments", ...scoped(scope)] as const,
  curriculum: (mallaId: string, scope: string | null = null) => ["career-academics", "curriculum", mallaId, ...scoped(scope)] as const,
  mallas: (scope: string | null = null) => ["career-academics", "mallas", ...scoped(scope)] as const,
  subjectProfile: (subjectId: string) => ["career-academics", "subject-profile", subjectId] as const,
  subjectProfilePreview: (subjectId: string) => ["career-academics", "subject-profile", subjectId, "preview"] as const,
  subjectProfileFields: (subjectId: string) => ["career-academics", "subject-profile", subjectId, "fields"] as const,
}

export const coordinatorCareerQuery = (scope: string | null = null) => ({
  queryKey: careerAcademicKeys.careerScope(scope),
  queryFn: async () => {
    if (scope !== null) return scope
    const session = await getSession()

    return session.active_role?.code === "coordinador" && session.active_role.career_id ? session.active_role.career_id : null
  },
  staleTime: 0,
})

export const scheduledSubjectsQuery = (scope: string | null = null) => ({ queryKey: careerAcademicKeys.scheduledSubjects(scope), queryFn: () => getScheduledSubjects(scope) })

export const teacherAssignmentsQuery = (scope: string | null = null) => ({ queryKey: careerAcademicKeys.teacherAssignments(scope), queryFn: () => getTeacherAssignments(scope) })

export const curriculumQuery = (mallaId: string, scope: string | null = null) => ({ queryKey: careerAcademicKeys.curriculum(mallaId, scope), queryFn: () => getCurriculum(mallaId, scope) })

export const mallasQuery = (scope: string | null = null) => ({ queryKey: careerAcademicKeys.mallas(scope), queryFn: () => getMallas(scope) })
