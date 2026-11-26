import { useEffect } from 'react';
import { setAcademicCareerScope } from '@/api/careerScope';

export function useAcademicCareerScope(careerId: string | null): void {
  useEffect(() => {
    setAcademicCareerScope(careerId);

    return () => setAcademicCareerScope(null);
  }, [careerId]);
}
