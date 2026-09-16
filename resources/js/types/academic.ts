export type Option = {
    id: string;
    nombre?: string;
    name?: string;
    label?: string;
    code?: string;
    codigo?: string;
    codigo_facultad?: string;
    codigo_campus?: string;
    codigo_carrera?: string;
    codigo_asignatura?: string;
    email?: string;
    correo_electronico?: string;
    starts_on?: string;
    ends_on?: string;
    active?: boolean;
    status?: 'proximo' | 'en_curso' | 'finalizado';
    status_label?: string;
    planning_enabled?: boolean;
    subject_id?: string;
    period_id?: string;
    /** Materias de la carrera activa: para agruparlas por ciclo al preparar un período. */
    ciclo?: number | null;
};

export type CatalogRecord = {
    id: string;
    codigo_facultad?: string | null;
    codigo_campus?: string | null;
    codigo?: string | null;
    nombre: string;
    activo: boolean;
    /** Solo facultades: logo que encabeza el sílabo de sus carreras. */
    logo_url?: string | null;
};

export type GovernanceCatalogEntity =
    'facultad' | 'carrera' | 'campus' | 'periodo';

export type GovernanceSection =
    'faculties' | 'careers' | 'campuses' | 'academic-periods';

export type AcademicStructureProps = {
    selectedPeriodId?: string | null;
    career: {
        id: string;
        name: string;
        /** Convocatoria abierta: la estructura queda congelada hasta pausarla. */
        lock_reason?: string | null;
    };
    /** Proceso institucional abierto: catálogos globales congelados hasta pausarlo. */
    lock_reason?: string | null;
    catalogs: {
        faculties: CatalogRecord[];
        careers: {
            id: string;
            faculty_id: string;
            /** Modalidad base elegida por Administración. */
            modality: string | null;
            modality_label: string | null;
            /** Quién coordina hoy; nulo si la carrera no tiene coordinación activa. */
            coordinator: { id: string; name: string } | null;
            campus_id: string | null;
            campus_name: string | null;
            code: string | null;
            name: string;
            active: boolean;
        }[];
        campuses: CatalogRecord[];
        periods: {
            id: string;
            code: string;
            starts_on: string;
            ends_on: string;
            teaching_weeks: number;
            status: 'proximo' | 'en_curso' | 'finalizado';
            status_label: string;
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
        campus_id: string;
        label: string;
        subject_code: string;
        subject_name: string;
        subject_cycle: number | null;
        period_starts_on: string;
        period_ends_on: string;
        period_status: 'proximo' | 'en_curso' | 'finalizado';
        period_status_label: string;
        period_planning_enabled: boolean;
        campus_name: string;
        modality_name: string;
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
        period_status: 'proximo' | 'en_curso' | 'finalizado';
        period_planning_enabled: boolean;
        active: boolean;
        editable: boolean;
    }[];
    options: {
        faculties: Option[];
        careers: Option[];
        periods: Option[];
        campuses: Option[];
        currentCurricula: Option[];
        activeSubjects: Option[];
        scheduledSubjects: Option[];
        parallels: Option[];
        coordinatorUsers: Option[];
        teacherUsers: Option[];
    };
};

export type FixedSubjectField = {
    id: string;
    key: string;
    label: string;
    type: 'texto' | 'numero' | 'entero' | 'booleano';
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
    /** Vacío = la de la carrera. Con valor, la materia tiene una excepción de modalidad. */
    modality: string | null;
    modality_label: string | null;
    credits: string | null;
    total_hours: number | null;
    active: boolean;
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
        /** Modalidad base aprobada por Administración. */
        modality: { value: string; label: string } | null;
    };
    curriculum: {
        id: string;
        code: string;
        cycle_count: number;
        editable: boolean;
        lock_reason: string | null;
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
        type: 'prerrequisito' | 'correquisito';
    }[];
    modalityOptions: { value: string; label: string }[];
    options: AcademicStructureProps['options'];
};
