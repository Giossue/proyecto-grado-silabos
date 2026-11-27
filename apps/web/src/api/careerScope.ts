let scopedCareerId: string | null = null;

export const setAcademicCareerScope = (careerId: string | null): void => {
  scopedCareerId = careerId;
};

export const academicCareerScope = (): string | null => scopedCareerId;

const careerBase = (careerId: string): string => `/admin/careers/${encodeURIComponent(careerId)}`;

export const careerAcademicPath = (path: string, careerId: string | null = scopedCareerId): string =>
  careerId ? `${careerBase(careerId)}/academic${path}` : `/coordination/academic${path}`;

export const fichaImportPath = (path: string, careerId: string | null = scopedCareerId): string =>
  careerId ? `${careerBase(careerId)}/ficha-imports${path}` : `/coordination/ficha-imports${path}`;
