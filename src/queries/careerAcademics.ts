import { getCurriculum, getScheduledSubjects, getTeacherAssignments } from "@/api/career-academics"
import { getSession } from "@/api/session"

export const careerAcademicKeys = {
  all: ["career-academics"] as const,
  careerScope: () => ["career-academics", "career-scope"] as const,
  scheduledSubjects: () => ["career-academics", "scheduled-subjects"] as const,
  teacherAssignments: () => ["career-academics", "teacher-assignments"] as const,
  curriculum: (careerId: string) => ["career-academics", "curriculum", careerId] as const,
  subjectProfile: (subjectId: string) => ["career-academics", "subject-profile", subjectId] as const,
  subjectProfilePreview: (subjectId: string) => ["career-academics", "subject-profile", subjectId, "preview"] as const,
}

export const coordinatorCareerQuery = () => ({
  queryKey: careerAcademicKeys.careerScope(),
  queryFn: async () => {
    const session = await getSession()

    return session.active_role?.code === "coordinador" && session.active_role.career_id ? session.active_role.career_id : null
  },
  staleTime: 0,
})

export const scheduledSubjectsQuery = () => ({ queryKey: careerAcademicKeys.scheduledSubjects(), queryFn: getScheduledSubjects })

export const teacherAssignmentsQuery = () => ({ queryKey: careerAcademicKeys.teacherAssignments(), queryFn: getTeacherAssignments })

export const curriculumQuery = (careerId: string) => ({ queryKey: careerAcademicKeys.curriculum(careerId), queryFn: () => getCurriculum(careerId) })
