import { describe, expect, it } from 'vitest';
import { libraryCommentLines } from '@/lib/reviewComment';

describe('libraryCommentLines', () => {
  it('separa los motivos y quita el punto final', () => {
    expect(libraryCommentLines('El libro no está disponible en biblioteca; El ISBN es incorrecto; Los datos de la obra están incompletos; Falta la edición 2020.'))
      .toEqual(['El libro no está disponible en biblioteca', 'El ISBN es incorrecto', 'Los datos de la obra están incompletos', 'Falta la edición 2020']);
  });

  it('un solo motivo queda en una lista de uno', () => {
    expect(libraryCommentLines('La edición está desactualizada.')).toEqual(['La edición está desactualizada']);
  });
});
