export type User = {
    id: string;
    nombre: string;
    correo_electronico: string;
    avatar?: string;
    correo_verificado_en: string | null;
    debe_cambiar_contrasena?: boolean;
    creado_en: string;
    actualizado_en: string;
    [key: string]: unknown;
};

export type Auth = {
    user: User;
    roles: ActiveRole[];
    active_role_id: string | null;
};

export type ActiveRole = {
    id: string;
    role: 'administrador' | 'coordinador' | 'docente';
    role_name: string;
    career_id: string | null;
    career_name: string | null;
};

export type TwoFactorConfigContent = {
    title: string;
    description: string;
    buttonText: string;
};
