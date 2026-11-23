import type { RoleCode } from '@/api/session';

export type User = {
    id: string;
    nombre: string;
    correo_electronico: string;
    avatar?: string;
    correo_verificado_en: string | null;
    [key: string]: unknown;
};

export type Auth = {
    user: User;
    roles: ActiveRole[];
    active_role_id: string | null;
};

export type ActiveRole = {
    id: string;
    role: RoleCode;
    role_name: string;
    career_id: string | null;
    career_name: string | null;
};

export type TwoFactorConfigContent = {
    title: string;
    description: string;
    buttonText: string;
};
