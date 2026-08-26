export type Option = {
    id: string;
    nombre?: string;
    name?: string;
    label?: string;
    code?: string;
    codigo?: string;
    codigo_institucional?: string;
    email?: string;
};

export type CatalogRecord = {
    id: string;
    codigo_institucional?: string | null;
    codigo?: string | null;
    nombre: string;
    activo: boolean;
};

export type GovernanceCatalogEntity =
    'faculty' | 'career' | 'campus' | 'modality' | 'period';

export type GovernanceSection =
    'faculties' | 'careers' | 'campuses' | 'modalities' | 'academic-periods';

export type AcademicStructureProps = {
    career: {
        id: string;
        name: string;
    };
    catalogs: {
        faculties: CatalogRecord[];
        careers: {
            id: string;
            faculty_id: string;
            code: string | null;
            name: string;
            active: boolean;
        }[];
        campuses: CatalogRecord[];
        modalities: CatalogRecord[];
        periods: {
            id: string;
            code: string;
            name: string;
            starts_on: string;
            ends_on: string;
            active: boolean;
        }[];
    };
    curricula: {
        id: string;
        code: string;
        version_number: number;
        state: string;
        career_name: string;
        subject_count: number;
        published_at: string | null;
    }[];
    subjects: {
        id: string;
        code: string;
        name: string;
        cycle: number | null;
        credits: string | null;
        total_hours: number | null;
        active: boolean;
        curriculum_code: string;
        career_name: string;
    }[];
    offerings: {
        id: string;
        label: string;
        period_name: string;
        campus_name: string;
        modality_name: string;
        parallel_count: number;
        active: boolean;
    }[];
    parallels: {
        id: string;
        code: string;
        active: boolean;
        offering_label: string;
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
        user_name: string;
        parallel_code: string;
        subject_name: string;
        period_name: string;
        valid_from: string;
        valid_until: string | null;
        active: boolean;
    }[];
    options: {
        faculties: Option[];
        careers: Option[];
        periods: Option[];
        campuses: Option[];
        modalities: Option[];
        draftCurricula: Option[];
        publishedSubjects: Option[];
        offerings: Option[];
        parallels: Option[];
        coordinatorUsers: Option[];
        teacherUsers: Option[];
    };
};
