export const SYLLABUS_PREVIEW_KEY = "silabos:docente:vista-previa"

export const rememberSyllabusPreview = (id: string, preview: boolean): void => {
  try {
    if (preview) window.sessionStorage.setItem(SYLLABUS_PREVIEW_KEY, id)
    else window.sessionStorage.removeItem(SYLLABUS_PREVIEW_KEY)
  } catch {
    return
  }
}

export const isSyllabusPreview = (id: string): boolean => {
  try {
    return window.sessionStorage.getItem(SYLLABUS_PREVIEW_KEY) === id
  } catch {
    return false
  }
}
