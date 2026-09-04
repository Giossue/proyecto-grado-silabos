export type Option = {
    id: string;
    nombre?: string;
    name?: string;
    label?: string;
    code?: string;
    codigo?: string;
    codigo_institucional?: string;
    email?: string;
    correo_electronico?: string;
    /** Materias de la malla activa: para agruparlas por ciclo al abrir ofertas. */
    ciclo?: number | null;
};

export type CatalogRecord = {
    id: string;
    codigo_institucional?: string | null;
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
            /** Base elegida por Administración; `modality_label` dice «Híbrida» si hay materias apartadas. */
            modality: string | null;
            modality_label: string | null;
            hybrid: boolean;
            /** Quién coordina hoy; nulo si la carrera no tiene coordinación vigente. */
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
            name: string;
            starts_on: string;
            ends_on: string;
            active: boolean;
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
        curriculum_code: string;
        curriculum_id: string;
        career_name: string;
        editable: boolean;
    }[];
    offerings: {
        id: string;
        subject_id: string;
        period_id: string;
        campus_id: string;
        label: string;
        period_name: string;
        campus_name: string;
        modality_name: string;
        parallel_count: number;
        active: boolean;
        editable: boolean;
    }[];
    parallels: {
        id: string;
        offering_id: string;
        code: string;
        shift: string | null;
        active: boolean;
        offering_label: string;
        editable: boolean;
    }[];
    coordinatorAssignments: {
        id: string;
        user_name: string;
        career_name: string;
        valid_from: string;
        valid_until: string | null;
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
        offerings: Option[];
        parallels: Option[];
        coordinatorUsers: Option[];
        teacherUsers: Option[];
    };
};

export type CurriculumFieldDefinition = {
    id: string;
    key: string;
    label: string;
    type: 'texto' | 'numero' | 'entero' | 'booleano';
    system_key: string | null;
    system_label: string | null;
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
    /** Vacío = la de la carrera. Con valor, la materia se aparta y la carrera es híbrida. */
    modality: string | null;
    modality_label: string | null;
    credits: string | null;
    total_hours: number | null;
    active: boolean;
    custom_values: Record<string, boolean | number | string | null>;
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
        /** Base aprobada; `hybrid` cuando alguna materia se aparta de ella. */
        modality: { value: string; label: string; hybrid: boolean } | null;
    };
    curriculum: {
        id: string;
        code: string;
        cycle_count: number;
        state: string;
        active: boolean;
        editable: boolean;
        lock_reason: string | null;
    };
    fieldDefinitions: CurriculumFieldDefinition[];
    fieldTotals: {
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
    systemFieldOptions: {
        value: string;
        label: string;
    }[];
    modalityOptions: { value: string; label: string }[];
    options: AcademicStructureProps['options'];
};
