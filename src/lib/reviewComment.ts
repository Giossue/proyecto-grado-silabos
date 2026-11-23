/** El comentario de Biblioteca guarda sus motivos en una sola línea separados por «; »: aquí vuelven a ser una lista. */
export const libraryCommentLines = (comment: string): string[] =>
    comment
        .split(';')
        .map((line) => line.trim().replace(/\.$/, '').trim())
        .filter((line) => line !== '');
