export type User = {
    id: string;
    name: string;
    email: string;
    avatar?: string;
    email_verified_at: string | null;
    must_change_password?: boolean;
    two_factor_enabled?: boolean;
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
};

export type Auth = {
    user: User;
    roles: ActiveRole[];
    active_role_id: string | null;
};

export type ActiveRole = {
    id: string;
    role: 'administrator' | 'coordinator' | 'teacher';
    role_name: string;
    career_name: string | null;
};

export type TwoFactorConfigContent = {
    title: string;
    description: string;
    buttonText: string;
};
