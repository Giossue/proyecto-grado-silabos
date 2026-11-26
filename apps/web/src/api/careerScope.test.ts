import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, apiBlob } from '@/api/client';
import { createParallels, deleteParallel, getCurriculum, getScheduledSubjects, getTeacherAssignments, replaceParallelTeacher, updateCurriculumConfiguration } from '@/api/career-academics';
import { careerAcademicPath, fichaImportPath, setAcademicCareerScope } from '@/api/careerScope';
import { downloadImportTemplate, sendImport } from '@/api/spreadsheet-import';

vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  api: vi.fn().mockResolvedValue({ message: 'ok' }),
  apiBlob: vi.fn().mockResolvedValue(new Blob()),
}));

const calledPaths = (): string[] => [...vi.mocked(api).mock.calls, ...vi.mocked(apiBlob).mock.calls].map((call) => String(call[0]));

describe('ámbito de carrera de las llamadas académicas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => setAcademicCareerScope(null));

  it('sin carrera elegida usa las rutas de Coordinación', async () => {
    await createParallels({ subject_id: 's1', codes: ['A'], shift: 'matutina', user_id: 'u1' }, 'unconfirmed');
    await getScheduledSubjects();
    expect(calledPaths()).toEqual(['/coordination/academic/parallels', '/coordination/academic/scheduled-subjects']);
    expect(fichaImportPath('/template')).toBe('/coordination/ficha-imports/template');
  });

  it('con la carrera del administrador llama a las rutas de esa carrera', async () => {
    setAcademicCareerScope('carrera-9');
    await createParallels({ subject_id: 's1', codes: ['A'], shift: 'matutina', user_id: 'u1' }, 'unconfirmed');
    await replaceParallelTeacher('p1', 'u1', 'unconfirmed');
    await deleteParallel('p1');
    await updateCurriculumConfiguration('carrera-9', { cycle_count: 8 });
    await sendImport('curriculum', new File(['x'], 'malla.xlsx'), false);
    await downloadImportTemplate('teachers', 'plantilla-docentes.xlsx');
    expect(calledPaths()).toEqual([
      '/admin/careers/carrera-9/academic/parallels',
      '/admin/careers/carrera-9/academic/parallels/p1/teacher',
      '/admin/careers/carrera-9/academic/parallels/p1',
      '/admin/careers/carrera-9/academic/curriculum/carrera-9/configuration',
      '/admin/careers/carrera-9/academic/curriculum-import',
      '/admin/careers/carrera-9/academic/teachers/import-template',
    ]);
    expect(fichaImportPath('/apply')).toBe('/admin/careers/carrera-9/ficha-imports/apply');
  });

  it('las lecturas usan la carrera que reciben aunque no haya ámbito activo', async () => {
    await getCurriculum('carrera-2', 'carrera-2');
    await getScheduledSubjects('carrera-2');
    await getTeacherAssignments('carrera-2');
    expect(calledPaths()).toEqual([
      '/admin/careers/carrera-2/academic/curriculum/carrera-2',
      '/admin/careers/carrera-2/academic/scheduled-subjects',
      '/admin/careers/carrera-2/academic/teacher-assignments',
    ]);
    expect(careerAcademicPath('/teachers', 'a/b')).toBe('/admin/careers/a%2Fb/academic/teachers');
  });
});
