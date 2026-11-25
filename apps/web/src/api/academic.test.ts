import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock('@/api/client', () => ({ api }));

import {
  deleteAcademicRecord,
  setAcademicRecordStatus,
  updateAcademicRecord,
} from '@/api/academic';

describe('academic API', () => {
  beforeEach(() => api.mockReset());

  it('uses the academic record mutation contract', async () => {
    api.mockResolvedValue({ message: 'ok' });

    await updateAcademicRecord('carrera', 'career-1', { nombre: 'Software' });
    await setAcademicRecordStatus('facultad', 'faculty-1', false);
    await deleteAcademicRecord('periodo', 'period-1');

    expect(api).toHaveBeenNthCalledWith(1, '/admin/academic/carrera/career-1', {
      method: 'PATCH',
      body: JSON.stringify({ nombre: 'Software' }),
    });
    expect(api).toHaveBeenNthCalledWith(2, '/admin/academic/facultad/faculty-1/status', {
      method: 'PATCH',
      body: JSON.stringify({ active: false }),
    });
    expect(api).toHaveBeenNthCalledWith(3, '/admin/academic/periodo/period-1', {
      method: 'DELETE',
    });
  });
});
