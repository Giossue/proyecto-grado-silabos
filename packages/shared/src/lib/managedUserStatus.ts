import type { StatusTone } from './statusTone';

/** Estado de una cuenta en Administración: la invitación vencida se ve aparte de la pendiente. */
export const managedUserStatus = (user: { active: boolean; pending_activation: boolean; invitation_expired: boolean }): { label: string; tone: StatusTone } => {
    if (!user.active) return { label: 'Inactivo', tone: 'neutral' };
    if (user.pending_activation) return { label: user.invitation_expired ? 'Invitación vencida' : 'Pendiente', tone: 'warning' };

    return { label: 'Activo', tone: 'success' };
};
