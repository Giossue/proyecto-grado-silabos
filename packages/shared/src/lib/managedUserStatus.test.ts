import { describe, expect, it } from 'vitest';
import { managedUserStatus } from './managedUserStatus';

describe('estado de una cuenta en Administración', () => {
  it('distingue la invitación vencida de la pendiente', () => {
    expect(managedUserStatus({ active: false, pending_activation: true, invitation_expired: true })).toEqual({ label: 'Inactivo', tone: 'neutral' });
    expect(managedUserStatus({ active: true, pending_activation: true, invitation_expired: false })).toEqual({ label: 'Pendiente', tone: 'warning' });
    expect(managedUserStatus({ active: true, pending_activation: true, invitation_expired: true })).toEqual({ label: 'Invitación vencida', tone: 'warning' });
    expect(managedUserStatus({ active: true, pending_activation: false, invitation_expired: false })).toEqual({ label: 'Activo', tone: 'success' });
  });
});
