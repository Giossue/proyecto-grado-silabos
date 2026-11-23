import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  api,
}));

import { ApiError } from '@/api/client';
import { PURGE_CANCELLED_MESSAGE, askFinalizedNoticeOnce, createParallels, replaceParallelTeacher, deleteCurriculumSubject, getSubjectProfile, saveSubjectProfile, updateCurriculumConfiguration, updateParallel } from '@/api/career-academics';
import { updateManagedUser } from '@/api/admin-users';
import { FINALIZED_NOTICE, purgeConfirmation } from '@/composables/usePurgeConfirmation';

const purgeError = () => new ApiError('purga', 422, {
  purge_required: ['Este cambio reemplazará 1 sílabo'],
  purge_count: ['1'],
});

const noticeError = () => new ApiError('aviso', 422, {
  purge_required: ['La convocatoria 2026-2027 ya finalizó.'],
  purge_count: ['0'],
  purge_mode: [FINALIZED_NOTICE],
});

describe('aviso de convocatoria finalizada', () => {
  beforeEach(() => api.mockReset());

  it('crear paralelos abre el aviso sin frase y reenvía con confirm_purge', async () => {
    api.mockRejectedValueOnce(noticeError()).mockResolvedValueOnce({ message: 'ok' });
    const dialog = purgeConfirmation;
    const payload = { subject_id: 's', codes: ['Z'], shift: 'matutina', user_id: 'u' };

    const result = createParallels(payload);
    await vi.waitFor(() => expect(dialog.open.value).toBe(true));
    expect(dialog.mode.value).toBe(FINALIZED_NOTICE);
    await dialog.confirm();

    await expect(result).resolves.toEqual({ message: 'ok' });
    expect(api).toHaveBeenLastCalledWith('/coordination/academic/parallels', {
      method: 'POST',
      body: JSON.stringify({ ...payload, confirm_purge: true }),
    });
  });

  it('eliminar una materia de la malla y cambiar un coordinador reenvían con confirm_purge', async () => {
    const dialog = purgeConfirmation;

    api.mockRejectedValueOnce(noticeError()).mockResolvedValueOnce({ message: 'ok' });
    const deleted = deleteCurriculumSubject('career-1', 'subject-1');
    await vi.waitFor(() => expect(dialog.open.value).toBe(true));
    await dialog.confirm();
    await deleted;
    expect(api).toHaveBeenLastCalledWith('/coordination/academic/curriculum/career-1/subjects/subject-1', { method: 'DELETE', body: JSON.stringify({ confirm_purge: true }) });

    api.mockRejectedValueOnce(noticeError()).mockResolvedValueOnce({ message: 'ok' });
    const updated = updateManagedUser('user-1', { nombre: 'A', correo_electronico: 'a@b.ec', role_code: 'coordinador', career_id: 'c', replace_coordinator: true });
    await vi.waitFor(() => expect(dialog.open.value).toBe(true));
    await dialog.confirm();
    await updated;
    expect(JSON.parse(String(api.mock.lastCall?.[1].body))).toMatchObject({ replace_coordinator: true, confirm_purge: true });
  });

  it('reemplazar el docente es una sola petición: cancelar no borra nada y confirmar la reenvía', async () => {
    const dialog = purgeConfirmation;

    api.mockRejectedValueOnce(noticeError());
    const cancelled = replaceParallelTeacher('p1', 'u2');
    await vi.waitFor(() => expect(dialog.open.value).toBe(true));
    dialog.cancel();
    await expect(cancelled).rejects.toThrow(PURGE_CANCELLED_MESSAGE);
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith('/coordination/academic/parallels/p1/teacher', { method: 'PUT', body: JSON.stringify({ user_id: 'u2' }) });

    api.mockRejectedValueOnce(noticeError()).mockResolvedValueOnce({ message: 'ok' });
    const confirmed = replaceParallelTeacher('p1', 'u2');
    await vi.waitFor(() => expect(dialog.open.value).toBe(true));
    await dialog.confirm();
    await expect(confirmed).resolves.toEqual({ message: 'ok' });
    expect(api).toHaveBeenLastCalledWith('/coordination/academic/parallels/p1/teacher', { method: 'PUT', body: JSON.stringify({ user_id: 'u2', confirm_purge: true }) });
  });

  it('un cambio en lote pregunta una sola vez y aplica la respuesta a todos', async () => {
    api.mockRejectedValueOnce(noticeError()).mockResolvedValueOnce({ message: 'uno' })
      .mockRejectedValueOnce(noticeError()).mockResolvedValueOnce({ message: 'dos' });
    const dialog = purgeConfirmation;

    const batch = askFinalizedNoticeOnce(async () => {
      await updateParallel('p1', { code: 'A', shift: 'nocturna' });
      await updateParallel('p2', { code: 'B', shift: 'nocturna' });
    });
    await vi.waitFor(() => expect(dialog.open.value).toBe(true));
    await dialog.confirm();
    await batch;

    expect(dialog.open.value).toBe(false);
    expect(api).toHaveBeenCalledTimes(4);
    expect(api).toHaveBeenLastCalledWith('/coordination/academic/parallels/p2', { method: 'PATCH', body: JSON.stringify({ code: 'B', shift: 'nocturna', confirm_purge: true }) });
  });

  it('cancelar en un lote no vuelve a preguntar ni reenvía', async () => {
    api.mockRejectedValueOnce(noticeError()).mockRejectedValueOnce(noticeError());
    const dialog = purgeConfirmation;
    const failures: string[] = [];

    const batch = askFinalizedNoticeOnce(async () => {
      for (const id of ['p1', 'p2']) {
        await updateParallel(id, { code: 'A', shift: 'nocturna' }).catch((reason: Error) => failures.push(reason.message));
      }
    });
    await vi.waitFor(() => expect(dialog.open.value).toBe(true));
    dialog.cancel();
    await batch;

    expect(failures).toEqual([PURGE_CANCELLED_MESSAGE, PURGE_CANCELLED_MESSAGE]);
    expect(api).toHaveBeenCalledTimes(2);
  });
});

describe('career academics API purge confirmation', () => {
  beforeEach(() => api.mockReset());

  it('asks for confirmation and resends the same change with confirm_purge', async () => {
    api.mockRejectedValueOnce(purgeError()).mockResolvedValueOnce({ message: 'ok' });
    const dialog = purgeConfirmation;

    const result = updateCurriculumConfiguration('career-1', { cycle_count: 9 });
    await vi.waitFor(() => expect(dialog.open.value).toBe(true));
    expect(dialog.message.value).toBe('Este cambio reemplazará 1 sílabo');
    await dialog.confirm();

    await expect(result).resolves.toEqual({ message: 'ok' });
    expect(api).toHaveBeenLastCalledWith('/coordination/academic/curriculum/career-1/configuration', {
      method: 'PATCH',
      body: JSON.stringify({ cycle_count: 9, confirm_purge: true }),
    });
  });

  it('rejects without resending when the coordinator cancels', async () => {
    api.mockRejectedValueOnce(purgeError());
    const dialog = purgeConfirmation;

    const result = updateCurriculumConfiguration('career-1', { cycle_count: 9 });
    await vi.waitFor(() => expect(dialog.open.value).toBe(true));
    dialog.cancel();

    await expect(result).rejects.toThrow(PURGE_CANCELLED_MESSAGE);
    expect(api).toHaveBeenCalledTimes(1);
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
