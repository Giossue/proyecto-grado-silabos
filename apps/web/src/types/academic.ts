import type { LockDetail } from '@/api/locks';
export type Option = {
  id: string;
  nombre?: string;
  name?: string;
  label?: string;
  code?: string;
  codigo?: string;
  codigo_carrera?: string;
  codigo_asignatura?: string;
  email?: string;
  correo_electronico?: string;
  starts_on?: string;
  ends_on?: string;
  active?: boolean;
  status?: "proximo" | "en_curso" | "finalizado";
  status_label?: string;
  planning_enabled?: boolean;
  subject_id?: string;
  period_id?: string;
  ciclo?: number | null;
};

export type CatalogRecord = {
  id: string;
  nombre: string;
  activo: boolean;
  deactivate_block?: string | null;
  lock_reason?: string | null;
  logo_url?: string | null;
  campus?: string | null;
  catalog_libraries?: string[];
};

export type GovernanceCatalogEntity = "facultad" | "carrera" | "periodo";

export type GovernanceSection = "faculties" | "careers" | "academic-periods";

export type AcademicStructureProps = {
  selectedPeriodId?: string | null;
  career: {
    id: string;
    name: string;
    lock_reason?: string | null;
  };
  lock_reason?: string | null;
  catalogs: {
    faculties: CatalogRecord[];
    careers: {
      id: string;
      faculty_id: string;
      modality: string | null;
      modality_label: string | null;
      coordinator: { id: string; name: string } | null;
      campus_name: string | null;
      code: string;
      name: string;
      active: boolean;
      deactivate_block?: string | null;
      deactivate_users?: { coordinators: number; teachers: number };
      lock_reason?: string | null;
    }[];
    periods: {
      id: string;
      code: string;
      starts_on: string;
      ends_on: string;
      teaching_weeks: number;
      status: "proximo" | "en_curso" | "finalizado";
      status_label: string;
      institutional_process: {
        id: string;
        state: "abierto" | "pausado" | "cerrado";
      } | null;
      lock_reason?: string | null;
    }[];
  };
  subjects: {
    id: string;
    code: string;
    name: string;
    cycle: number | null;
    credits: string | null;
    total_hours: number | null;
    active: boolean;
    career_name: string;
    editable: boolean;
  }[];
  scheduledSubjects: {
    id: string;
    subject_id: string;
    period_id: string;
    label: string;
    subject_code: string;
    subject_name: string;
    subject_cycle: number | null;
    period_starts_on: string;
    period_ends_on: string;
    period_status: "proximo" | "en_curso" | "finalizado";
    period_status_label: string;
    period_planning_enabled: boolean;
    campus_name: string | null;
    modality_name: string | null;
    parallels: {
      id: string;
      code: string;
      shift: string | null;
    }[];
    active: boolean;
    editable: boolean;
  }[];
  parallels: {
    id: string;
    scheduled_subject_id: string;
    code: string;
    shift: string | null;
    subject_code: string;
    subject_name: string;
    period_starts_on: string;
    period_ends_on: string;
    editable: boolean;
  }[];
  coordinatorAssignments: {
    id: string;
    user_name: string;
    career_name: string;
    active: boolean;
  }[];
  teacherAssignments: {
    id: string;
    user_id: string;
    parallel_id: string;
    user_name: string;
    user_email: string;
    parallel_code: string;
    subject_name: string;
    period_name: string;
    period_status: "proximo" | "en_curso" | "finalizado";
    period_planning_enabled: boolean;
    active: boolean;
    editable: boolean;
  }[];
  options: {
    faculties: Option[];
    careers: Option[];
    periods: Option[];
    campusOptions: Array<{ value: string; label: string }>;
    modalityOptions: Array<{ value: string; label: string }>;
    shiftOptions: Array<{ value: string; label: string }>;
    currentCurricula: Option[];
    activeSubjects: Option[];
    scheduledSubjects: Option[];
    parallels: Option[];
    teacherUsers: Option[];
  };
};

export type FixedSubjectField = {
  id: string;
  key: string;
  label: string;
  type: "texto" | "numero" | "entero" | "booleano";
  system_key: string;
  system_label: string;
  position: number;
  visible_on_card: boolean;
  totalizable: boolean;
};

export type CurriculumBuilderSubject = {
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
  display_fields: {
    id: string;
    label: string;
    value: boolean | number | string | null;
  }[];
};

export type CurriculumBuilderProps = {
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
  fixedFields: FixedSubjectField[];
  fixedFieldTotals: {
    id: string;
    label: string;
    value: number;
  }[];
  subjects: CurriculumBuilderSubject[];
  requirements: {
    id: string;
    subject_id: string;
    requirement_id: string;
    type: "prerrequisito" | "correquisito";
  }[];
  modalityOptions: { value: string; label: string }[];
  organizationUnitOptions: { value: string; label: string }[];
  options: AcademicStructureProps["options"];
};
