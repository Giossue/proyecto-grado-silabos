import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  api,
}));

import { ApiError } from '@/api/client';
import { createParallels, replaceParallelTeacher, deleteCurriculumSubject, getSubjectProfile, saveSubjectProfile, updateCurriculumConfiguration } from '@/api/career-academics';
import { updateManagedUser } from '@/api/admin-users';
import { toast } from '@/lib/toast';

vi.mock('@/lib/toast', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

const purgeError = () => new ApiError('purga', 422, {
  purge_required: ['Este cambio reemplazará 1 sílabo'],
  purge_count: ['1'],
});

const noticeError = () => new ApiError('aviso', 422, {
  purge_required: ['El periodo académico 2026-2027 ya finalizó.'],
  purge_count: ['0'],
  purge_mode: ['convocatoria_finalizada'],
});

describe('career academics API purge, without confirmation dialog', () => {
  beforeEach(() => {
    api.mockReset();
    vi.mocked(toast.info).mockReset();
  });

  it('resends the same change with confirm_purge right away and shows the server notice', async () => {
    api.mockRejectedValueOnce(purgeError()).mockResolvedValueOnce({ message: 'ok' });

    await expect(updateCurriculumConfiguration('career-1', { cycle_count: 9 })).resolves.toEqual({ message: 'ok' });

    expect(api).toHaveBeenCalledTimes(2);
    expect(api).toHaveBeenLastCalledWith('/coordination/academic/curriculum/career-1/configuration', {
      method: 'PATCH',
      body: JSON.stringify({ cycle_count: 9, confirm_purge: true }),
    });
    expect(toast.info).toHaveBeenCalledWith('Este cambio reemplazará 1 sílabo');
  });

  it('a finished academic period notice also resends directly', async () => {
    const payload = { subject_id: 's', codes: ['Z'], shift: 'matutina', user_id: 'u' };
    api.mockRejectedValueOnce(noticeError()).mockResolvedValueOnce({ message: 'ok' });
    await expect(createParallels(payload)).resolves.toEqual({ message: 'ok' });
    expect(api).toHaveBeenLastCalledWith('/coordination/academic/parallels', {
      method: 'POST',
      body: JSON.stringify({ ...payload, confirm_purge: true }),
    });

    api.mockRejectedValueOnce(noticeError()).mockResolvedValueOnce({ message: 'ok' });
    await deleteCurriculumSubject('career-1', 'subject-1');
    expect(api).toHaveBeenLastCalledWith('/coordination/academic/curriculum/career-1/subjects/subject-1', { method: 'DELETE', body: JSON.stringify({ confirm_purge: true }) });

    api.mockRejectedValueOnce(noticeError()).mockResolvedValueOnce({ message: 'ok' });
    await updateManagedUser('user-1', { nombre: 'A', correo_electronico: 'a@b.ec', role_code: 'coordinador', career_id: 'c', replace_coordinator: true });
    expect(JSON.parse(String(api.mock.lastCall?.[1].body))).toMatchObject({ replace_coordinator: true, confirm_purge: true });
  });

  it('does not resend errors that are not a purge request', async () => {
    api.mockRejectedValueOnce(new ApiError('Datos inválidos', 422, { user_id: ['Obligatorio'] }));

    await expect(replaceParallelTeacher('p1', 'u2')).rejects.toThrow('Datos inválidos');
    expect(api).toHaveBeenCalledTimes(1);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('does not loop when the confirmed resend is also rejected', async () => {
    api.mockRejectedValueOnce(purgeError()).mockRejectedValueOnce(purgeError());

    await expect(replaceParallelTeacher('p1', 'u2')).rejects.toThrow('purga');
    expect(api).toHaveBeenCalledTimes(2);
    expect(api).toHaveBeenLastCalledWith('/coordination/academic/parallels/p1/teacher', { method: 'PUT', body: JSON.stringify({ user_id: 'u2', confirm_purge: true }) });
  });
});

describe('subject profile API', () => {
  beforeEach(() => api.mockReset());

  it('reads and saves the profile values through the versioned API', async () => {
    const values = { 'field-1': { type: 'doc', content: [{ type: 'paragraph' }] } };
    api.mockResolvedValue({ fields: [], values, complete: false });
    await getSubjectProfile('subject-1');
    await saveSubjectProfile('subject-1', values);
    expect(api).toHaveBeenNthCalledWith(1, '/academic/asignaturas/subject-1/ficha');
    expect(api).toHaveBeenNthCalledWith(2, '/academic/asignaturas/subject-1/ficha', {
      method: 'PUT', body: JSON.stringify({ values }),
    });
  });
});
