import { setTemplateRuntime } from "@/lib/blocks/runtime";
import type { TemplateDefinitionPayload } from "@silabos/shared/lib/blocks/types";
import type { LockDetail } from '@/api/locks';
import type { DocumentPresentation } from '@/api/syllabi';
import type { PreviewSection } from '@/components/domain/syllabus/previewSection';
import type { DocumentNode } from '@silabos/shared/lib/templateDocument';
import { api, ApiError } from "@/api/client";
import { careerAcademicPath } from "@/api/careerScope";
import { FINALIZED_NOTICE, requestPurgeConfirmation } from "@/composables/usePurgeConfirmation";

export const PURGE_CANCELLED_MESSAGE = "Cambio cancelado. No se guardó nada";

let noticeBatch: { answer: boolean | null } | null = null;

export async function askFinalizedNoticeOnce<T>(run: () => Promise<T>): Promise<T> {
  noticeBatch = { answer: null };
  try {
    return await run();
  } finally {
    noticeBatch = null;
  }
}

export function withPurgeConfirmation<T>(
  send: (confirmPurge: boolean) => Promise<T>,
): Promise<T> {
  return send(false).catch((reason: unknown) => {
    const purgeMessage =
      reason instanceof ApiError ? reason.errors.purge_required?.[0] : undefined;
    if (!(reason instanceof ApiError) || !purgeMessage) throw reason;
    const purgeMode = reason.errors.purge_mode?.[0];
    const batch = purgeMode === FINALIZED_NOTICE ? noticeBatch : null;
    if (batch?.answer === true) return send(true);
    if (batch?.answer === false) throw new ApiError(PURGE_CANCELLED_MESSAGE, 409);

    return new Promise<T>((resolve, reject) => {
      requestPurgeConfirmation(
        purgeMessage,
        Number(reason.errors.purge_count?.[0] ?? 0),
        () => {
          if (batch) batch.answer = true;
          return send(true).then(resolve, reject);
        },
        () => {
          if (batch) batch.answer = false;
          reject(new ApiError(PURGE_CANCELLED_MESSAGE, 409));
        },
        purgeMode,
      );
    });
  });
}

export const jsonBody = (payload: object, confirmPurge: boolean): string =>
  JSON.stringify(confirmPurge ? { ...payload, confirm_purge: true } : payload);

export type Curriculum = {
  career: {
    id: string;
    name: string;
    modality: { value: string; label: string } | null;
  };
  curriculum: {
    id: string;
    cycle_count: number;
    editable: boolean;
    lock_reason: string | null;
    lock?: LockDetail | null;
  };
  fixedFields: Array<{
    id: string;
    key: string;
    label: string;
    type: "texto" | "numero" | "entero" | "booleano";
    system_key: string;
    system_label: string;
    position: number;
    visible_on_card: boolean;
    totalizable: boolean;
  }>;
  fixedFieldTotals: Array<{ id: string; label: string; value: number }>;
  subjects: Array<{
    id: string;
    code: string;
    name: string;
    cycle: number | null;
    position: number;
    organization_unit: string | null;
    organization_unit_label: string | null;
    modality: string | null;
    modality_label: string | null;
    credits: string | null;
    total_hours: number | null;
    active: boolean;
    generates_syllabus: boolean;
    system_values: Record<string, number | string | null>;
    display_fields: Array<{
      id: string;
      label: string;
      value: string | number | boolean | null;
    }>;
  }>;
  requirements: Array<{
    id: string;
    subject_id: string;
    requirement_id: string;
  }>;
  modalityOptions: Array<{ value: string; label: string }>;
  organizationUnitOptions: Array<{ value: string; label: string }>;
};

export type ScheduledSubjects = {
  career: { id: string; name: string; lock_reason: string | null; lock?: LockDetail | null };
  scheduledSubjects: Array<{
    subject_id: string;
    label: string;
    subject_code: string;
    subject_name: string;
    subject_cycle: number | null;
    profile_complete?: boolean;
    generates_syllabus: boolean;
    modality_name: string | null;
    parallels: Array<{ id: string; code: string; shift: string | null; editable?: boolean; deletable?: boolean; sent_syllabus?: boolean; started_syllabus?: boolean }>;
    editable: boolean;
  }>;
  options: {
    shiftOptions: Array<{ value: string; label: string }>;
    activeSubjects: Array<{
      id: string;
      codigo_asignatura: string;
      nombre: string;
      ciclo: number;
      generates_syllabus: boolean;
      profile_complete?: boolean;
      profile_filled?: number;
      profile_total?: number;
    }>;
  };
};

export type SubjectProfileField = { id: string; key: string; label: string; section: string | null; quien_llena: 'carrera'; content: DocumentNode; template?: DocumentNode; position?: number };

export type SubjectProfile = {
  fields: SubjectProfileField[];
  values: Record<string, DocumentNode | null>;
  complete: boolean;
  definition?: TemplateDefinitionPayload;
  variables?: Record<string, string>;
};

const rememberDefinition = (profile: SubjectProfile): SubjectProfile => {
  setTemplateRuntime(profile.definition, profile.variables);
  return profile;
};

export const getSubjectProfile = (subjectId: string) =>
  api<SubjectProfile>(`/academic/asignaturas/${subjectId}/ficha`).then(rememberDefinition);

/** Cómo se verá el sílabo de la materia con los datos de la malla y lo guardado en el proyecto de carrera. */
export type SubjectProfilePreview = { presentation: DocumentPresentation; sections: PreviewSection[] };

export const getSubjectProfilePreview = (subjectId: string) =>
  api<SubjectProfilePreview>(`/academic/asignaturas/${subjectId}/ficha/vista-previa`);

export const saveSubjectProfile = (subjectId: string, values: Record<string, DocumentNode | null>) =>
  withPurgeConfirmation((confirmPurge) => api<SubjectProfile>(`/academic/asignaturas/${subjectId}/ficha`, {
    method: "PUT",
    body: jsonBody({ values }, confirmPurge),
  }));

export type TeacherAssignments = {
  canCreateTeacher: boolean;
  career: { id: string; name: string; lock_reason: string | null; lock?: LockDetail | null };
  pendingTeachers: Array<{ id: string; name: string; email: string }>;
  careerTeachers: Array<{ id: string; name: string; email: string; pending_activation: boolean; invitation_expired: boolean }>;
  teacherAssignments: Array<{
    id: string;
    user_id: string;
    parallel_id: string;
    user_name: string;
    user_email: string;
    parallel_code: string;
    subject_name: string;
    active: boolean;
    editable: boolean;
  }>;
  options: {
    parallels: Array<{ id: string; label: string }>;
    teacherUsers: Array<{ id: string; name: string; email: string }>;
  };
};

export const getCurriculum = (careerId: string, scope: string | null = null) =>
  api<Curriculum>(careerAcademicPath(`/curriculum/${careerId}`, scope));

export const getScheduledSubjects = (scope: string | null = null) =>
  api<ScheduledSubjects>(careerAcademicPath("/scheduled-subjects", scope));
export const getTeacherAssignments = (scope: string | null = null) =>
  api<TeacherAssignments>(careerAcademicPath("/teacher-assignments", scope));
/**
 * Cómo tratar la confirmación de un cambio que afecta sílabos. `ask` (por defecto) pregunta si hace falta.
 * En un cambio masivo la pantalla pregunta una sola vez antes de empezar: `confirmed` envía la respuesta ya dada y
 * `unconfirmed` no acepta reiniciar nada (si el estado cambió entretanto, esa petición falla y se informa).
 */
export type PurgeHandling = 'ask' | 'confirmed' | 'unconfirmed';
const sendWith = <T>(send: (confirm: boolean) => Promise<T>, purge: PurgeHandling): Promise<T> => {
  if (purge === 'confirmed') return send(true);
  if (purge === 'unconfirmed') return send(false);

  return withPurgeConfirmation(send);
};

export const createCareerRecord = (
  entity: string,
  payload: Record<string, unknown>,
  purge: PurgeHandling = 'ask',
) =>
  sendWith((confirm) =>
    api<{ message: string }>(careerAcademicPath(`/${entity}`), {
      method: "POST",
      body: jsonBody(payload, confirm),
    }),
  purge);
export const deleteCareerRecord = (entity: string, id: string) =>
  api<{ message: string }>(careerAcademicPath(`/${entity}/${id}`), {
    method: "DELETE",
  });
export const updateCurriculumConfiguration = (
  careerId: string,
  payload: { cycle_count: number },
) =>
  withPurgeConfirmation((confirm) =>
    api<{ message: string }>(
      careerAcademicPath(`/curriculum/${careerId}/configuration`),
      { method: "PATCH", body: jsonBody(payload, confirm) },
    ),
  );
export const updateSubjectLayout = (
  curriculumId: string,
  payload: { subject_id: string; cycle: number; position: number },
) =>
  withPurgeConfirmation((confirm) =>
    api<{ message: string }>(
      careerAcademicPath(`/curriculum/${curriculumId}/subject-layout`),
      { method: "PATCH", body: jsonBody(payload, confirm) },
    ),
  );
export const updateCareerRecord = (
  entity: string,
  id: string,
  payload: Record<string, unknown>,
) =>
  withPurgeConfirmation((confirm) =>
    api<{ message: string }>(careerAcademicPath(`/${entity}/${id}`), {
      method: "PATCH",
      body: jsonBody(payload, confirm),
    }),
  );
export const createSubjectRequirement = (
  curriculumId: string,
  payload: {
    subject_id: string;
    requirement_id: string;
  },
) =>
  withPurgeConfirmation((confirm) =>
    api<{ message: string }>(
      careerAcademicPath(`/curriculum/${curriculumId}/requirements`),
      { method: "POST", body: jsonBody(payload, confirm) },
    ),
  );
export const deleteSubjectRequirement = (
  curriculumId: string,
  requirementId: string,
) =>
  withPurgeConfirmation((confirm) =>
    api<{ message: string }>(
      careerAcademicPath(`/curriculum/${curriculumId}/requirements/${requirementId}`),
      { method: "DELETE", ...(confirm ? { body: jsonBody({}, true) } : {}) },
    ),
  );
export const deleteCurriculumSubject = (
  curriculumId: string,
  subjectId: string,
) =>
  withPurgeConfirmation((confirm) =>
    api<{ message: string }>(
      careerAcademicPath(`/curriculum/${curriculumId}/subjects/${subjectId}`),
      { method: "DELETE", ...(confirm ? { body: jsonBody({}, true) } : {}) },
    ),
  );
export const createParallels = (payload: {
  subject_id: string;
  codes: string[];
  shift: string;
  user_id: string;
}, purge: PurgeHandling = 'ask') =>
  sendWith((confirm) =>
    api<{ message: string }>(careerAcademicPath("/parallels"), {
      method: "POST",
      body: jsonBody(payload, confirm),
    }),
  purge);
export const updateParallel = (id: string, payload: { code: string; shift: string }, purge: PurgeHandling = 'ask') =>
  sendWith((confirm) => api<{ message: string }>(careerAcademicPath(`/parallels/${id}`), {
    method: "PATCH",
    body: jsonBody(payload, confirm),
  }), purge);
export const replaceParallelTeacher = (parallelId: string, userId: string, purge: PurgeHandling = 'ask') =>
  sendWith((confirm) =>
    api<{ message: string }>(careerAcademicPath(`/parallels/${parallelId}/teacher`), {
      method: "PUT",
      body: jsonBody({ user_id: userId }, confirm),
    }),
  purge);
export const deleteParallel = (id: string) =>
  api<{ message: string }>(careerAcademicPath(`/parallels/${id}`), {
    method: "DELETE",
  });
export const createCareerTeacher = (payload: {
  nombres: string;
  apellidos: string;
  correo_electronico: string;
}) =>
  api<{ message: string }>(careerAcademicPath("/teachers"), {
    method: "POST",
    body: JSON.stringify(payload),
  });
/** Solo cuando la invitación venció sin aceptarse; el enlace llega al correo del docente. */
export const resendCareerTeacherInvitation = (userId: string) =>
  api<{ message: string }>(careerAcademicPath(`/teachers/${userId}/resend-activation`), {
    method: "POST",
  });
export const removeCareerTeacher = (userId: string) =>
  api<{ message: string }>(careerAcademicPath(`/teachers/${userId}`), {
    method: "DELETE",
  });
