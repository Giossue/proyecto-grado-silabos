export const TEMPLATE_REDONE = "proceso.plantilla_rehecho"

export const SYLLABUS_CHANGED = "Su sílabo cambió"

export function workflowMessage(eventType: string, subject: string | null, revision: number | null): [string, string] {
  if (eventType === TEMPLATE_REDONE) {
    return [
      "Sus sílabos cambiaron",
      "Administración cambió la plantilla del proceso de sílabos. Se conservó lo que ya había escrito; revíselos y envíelos otra vez.",
    ]
  }
  if (subject === null) throw new Error("El aviso necesita un sílabo.")
  const revisionLabel = revision === null ? "" : `, revisión ${revision}`
  switch (eventType) {
    case "silabo.enviado":
      return ["Sílabo enviado", `Revise la bibliografía del sílabo de ${subject}${revisionLabel}.`]
    case "silabo.reenviado_biblioteca":
      return ["Sílabo corregido para revisar", `El docente atendió su pedido en el sílabo de ${subject}${revisionLabel}. Revise de nuevo la bibliografía.`]
    case "silabo.correccion_solicitada":
      return ["Corrección solicitada", `Revise las observaciones del sílabo de ${subject}${revisionLabel}, corríjalo y envíelo otra vez.`]
    case "biblioteca.verificado":
      return ["Bibliografía verificada por Biblioteca", `Revise y apruebe el sílabo de ${subject}${revisionLabel}.`]
    case "silabo.aprobado":
      return ["Sílabo aprobado", `Ya puede descargar el PDF firmado del sílabo de ${subject}${revisionLabel}.`]
    case "silabo.eliminado":
      return [SYLLABUS_CHANGED, `Coordinación eliminó el sílabo aprobado de ${subject}. Se borró lo que había escrito; complételo de nuevo.`]
    case "silabo.devuelto_borrador":
      return [
        SYLLABUS_CHANGED,
        `Cambiaron datos de la carrera, la malla o el proyecto de carrera que usa el sílabo de ${subject}. Se conservó lo que había escrito; revíselo, envíelo y fírmelo de nuevo.`,
      ]
    case "documento.exportacion_fallida":
      return [
        "No se pudieron generar los documentos",
        `Es el PDF del sílabo de ${subject}${revisionLabel}. Revise el servicio de documentos y la cola; después, Coordinación puede generarlo de nuevo desde «Documentos».`,
      ]
    default:
      throw new Error("Tipo de notificación interna no soportado.")
  }
}
