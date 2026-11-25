import { relations } from "drizzle-orm"
import {
  ajustesSistema,
  aprobaciones,
  archivos,
  asignacionesParalelo,
  asignacionesRol,
  asignaturas,
  camposPlantilla,
  carreras,
  convocatoriasCarreras,
  convocatoriasUniversidad,
  definicionesCampo,
  documentosApoyo,
  enviosBiblioteca,
  exportacionesSilabo,
  facultades,
  firmasSilabo,
  invitacionesActivacion,
  mensajesIaPlantilla,
  notificaciones,
  paralelos,
  periodosAcademicos,
  plantillaSilabo,
  propuestasIaPlantilla,
  requisitosAsignatura,
  revisionesCoordinacion,
  revisionesSilabo,
  seccionesPlantilla,
  sesiones,
  silabos,
  usuarios,
  valoresCampo,
} from "./tables"

export const usuariosRelations = relations(usuarios, ({ many }) => ({
  asignacionesRol: many(asignacionesRol),
  sesiones: many(sesiones),
  notificaciones: many(notificaciones),
  invitacionesActivacion: many(invitacionesActivacion, { relationName: "invitacionUsuario" }),
}))

export const asignacionesRolRelations = relations(asignacionesRol, ({ one, many }) => ({
  usuario: one(usuarios, { fields: [asignacionesRol.usuarioId], references: [usuarios.usuarioId] }),
  carrera: one(carreras, { fields: [asignacionesRol.carreraId], references: [carreras.carreraId] }),
  asignacionesParalelo: many(asignacionesParalelo),
}))

export const sesionesRelations = relations(sesiones, ({ one }) => ({
  usuario: one(usuarios, { fields: [sesiones.userId], references: [usuarios.usuarioId] }),
}))

export const invitacionesActivacionRelations = relations(invitacionesActivacion, ({ one }) => ({
  usuario: one(usuarios, { fields: [invitacionesActivacion.usuarioId], references: [usuarios.usuarioId], relationName: "invitacionUsuario" }),
  emitidaPor: one(usuarios, { fields: [invitacionesActivacion.emitidaPorUsuarioId], references: [usuarios.usuarioId] }),
}))

export const archivosRelations = relations(archivos, ({ one }) => ({
  subidoPor: one(usuarios, { fields: [archivos.subidoPor], references: [usuarios.usuarioId] }),
}))

export const facultadesRelations = relations(facultades, ({ one, many }) => ({
  logo: one(archivos, { fields: [facultades.logoArchivoId], references: [archivos.archivoId] }),
  carreras: many(carreras),
}))

export const carrerasRelations = relations(carreras, ({ one, many }) => ({
  facultad: one(facultades, { fields: [carreras.facultadId], references: [facultades.facultadId] }),
  asignaturas: many(asignaturas),
  asignacionesRol: many(asignacionesRol),
  convocatoriasCarreras: many(convocatoriasCarreras),
  documentosApoyo: many(documentosApoyo),
}))

export const asignaturasRelations = relations(asignaturas, ({ one, many }) => ({
  carrera: one(carreras, { fields: [asignaturas.carreraId], references: [carreras.carreraId] }),
  paralelos: many(paralelos),
  requisitos: many(requisitosAsignatura, { relationName: "requisitoDeAsignatura" }),
  valoresCampo: many(valoresCampo),
}))

export const requisitosAsignaturaRelations = relations(requisitosAsignatura, ({ one }) => ({
  asignatura: one(asignaturas, { fields: [requisitosAsignatura.asignaturaId], references: [asignaturas.asignaturaId], relationName: "requisitoDeAsignatura" }),
  requisito: one(asignaturas, { fields: [requisitosAsignatura.requisitoId], references: [asignaturas.asignaturaId] }),
}))

export const paralelosRelations = relations(paralelos, ({ one, many }) => ({
  asignatura: one(asignaturas, { fields: [paralelos.asignaturaId], references: [asignaturas.asignaturaId] }),
  asignacionesParalelo: many(asignacionesParalelo),
  silabos: many(silabos),
}))

export const asignacionesParaleloRelations = relations(asignacionesParalelo, ({ one }) => ({
  paralelo: one(paralelos, { fields: [asignacionesParalelo.paraleloId], references: [paralelos.paraleloId] }),
  asignacionRol: one(asignacionesRol, { fields: [asignacionesParalelo.asignacionRolId], references: [asignacionesRol.asignacionRolId] }),
}))

export const documentosApoyoRelations = relations(documentosApoyo, ({ one }) => ({
  carrera: one(carreras, { fields: [documentosApoyo.carreraId], references: [carreras.carreraId] }),
  archivo: one(archivos, { fields: [documentosApoyo.archivoId], references: [archivos.archivoId] }),
  archivoVista: one(archivos, { fields: [documentosApoyo.archivoVistaId], references: [archivos.archivoId] }),
  subidoPor: one(usuarios, { fields: [documentosApoyo.subidoPor], references: [usuarios.usuarioId] }),
}))

export const periodosAcademicosRelations = relations(periodosAcademicos, ({ many }) => ({
  convocatoriasUniversidad: many(convocatoriasUniversidad),
  notificaciones: many(notificaciones),
}))

export const convocatoriasUniversidadRelations = relations(convocatoriasUniversidad, ({ one, many }) => ({
  periodoAcademico: one(periodosAcademicos, { fields: [convocatoriasUniversidad.periodoAcademicoId], references: [periodosAcademicos.periodoAcademicoId] }),
  convocatoriasCarreras: many(convocatoriasCarreras),
}))

export const convocatoriasCarrerasRelations = relations(convocatoriasCarreras, ({ one, many }) => ({
  carrera: one(carreras, { fields: [convocatoriasCarreras.carreraId], references: [carreras.carreraId] }),
  convocatoriaUniversidad: one(convocatoriasUniversidad, {
    fields: [convocatoriasCarreras.convocatoriaUniversidadId],
    references: [convocatoriasUniversidad.convocatoriaUniversidadId],
  }),
  silabos: many(silabos),
}))

export const silabosRelations = relations(silabos, ({ one, many }) => ({
  convocatoriaCarrera: one(convocatoriasCarreras, { fields: [silabos.convocatoriaCarreraId], references: [convocatoriasCarreras.convocatoriaCarreraId] }),
  paralelo: one(paralelos, { fields: [silabos.paraleloId], references: [paralelos.paraleloId] }),
  revisiones: many(revisionesSilabo),
  firmas: many(firmasSilabo),
  valoresCampo: many(valoresCampo),
}))

export const revisionesSilaboRelations = relations(revisionesSilabo, ({ one, many }) => ({
  silabo: one(silabos, { fields: [revisionesSilabo.silaboId], references: [silabos.silaboId] }),
  revisionAnterior: one(revisionesSilabo, { fields: [revisionesSilabo.revisionAnteriorId], references: [revisionesSilabo.revisionSilaboId] }),
  enviadoPor: one(usuarios, { fields: [revisionesSilabo.enviadoPor], references: [usuarios.usuarioId] }),
  correccionSolicitadaPor: one(usuarios, { fields: [revisionesSilabo.correccionSolicitadaPor], references: [usuarios.usuarioId] }),
  aprobaciones: many(aprobaciones),
  revisionesCoordinacion: many(revisionesCoordinacion),
  enviosBiblioteca: many(enviosBiblioteca),
  firmas: many(firmasSilabo),
  exportaciones: many(exportacionesSilabo),
}))

export const aprobacionesRelations = relations(aprobaciones, ({ one }) => ({
  revisionSilabo: one(revisionesSilabo, { fields: [aprobaciones.revisionSilaboId], references: [revisionesSilabo.revisionSilaboId] }),
  aprobadoPor: one(usuarios, { fields: [aprobaciones.aprobadoPor], references: [usuarios.usuarioId] }),
  aprobacionAnterior: one(aprobaciones, { fields: [aprobaciones.aprobacionAnteriorId], references: [aprobaciones.aprobacionId] }),
}))

export const revisionesCoordinacionRelations = relations(revisionesCoordinacion, ({ one }) => ({
  revisionSilabo: one(revisionesSilabo, { fields: [revisionesCoordinacion.revisionSilaboId], references: [revisionesSilabo.revisionSilaboId] }),
  revisadoPor: one(usuarios, { fields: [revisionesCoordinacion.revisadoPor], references: [usuarios.usuarioId] }),
}))

export const enviosBibliotecaRelations = relations(enviosBiblioteca, ({ one }) => ({
  revisionSilabo: one(revisionesSilabo, { fields: [enviosBiblioteca.revisionSilaboId], references: [revisionesSilabo.revisionSilaboId] }),
  verificadoPor: one(usuarios, { fields: [enviosBiblioteca.verificadoPor], references: [usuarios.usuarioId] }),
}))

export const firmasSilaboRelations = relations(firmasSilabo, ({ one }) => ({
  silabo: one(silabos, { fields: [firmasSilabo.silaboId], references: [silabos.silaboId] }),
  revisionSilabo: one(revisionesSilabo, { fields: [firmasSilabo.revisionSilaboId], references: [revisionesSilabo.revisionSilaboId] }),
  usuario: one(usuarios, { fields: [firmasSilabo.usuarioId], references: [usuarios.usuarioId] }),
}))

export const exportacionesSilaboRelations = relations(exportacionesSilabo, ({ one }) => ({
  revisionSilabo: one(revisionesSilabo, { fields: [exportacionesSilabo.revisionSilaboId], references: [revisionesSilabo.revisionSilaboId] }),
  archivoPdf: one(archivos, { fields: [exportacionesSilabo.archivoPdfId], references: [archivos.archivoId] }),
  solicitadoPor: one(usuarios, { fields: [exportacionesSilabo.solicitadoPor], references: [usuarios.usuarioId] }),
}))

export const plantillaSilaboRelations = relations(plantillaSilabo, ({ many }) => ({
  secciones: many(seccionesPlantilla),
  campos: many(camposPlantilla),
  definiciones: many(definicionesCampo),
  mensajesIa: many(mensajesIaPlantilla),
  propuestasIa: many(propuestasIaPlantilla),
}))

export const seccionesPlantillaRelations = relations(seccionesPlantilla, ({ one, many }) => ({
  plantilla: one(plantillaSilabo, { fields: [seccionesPlantilla.plantillaId], references: [plantillaSilabo.plantillaId] }),
  campos: many(camposPlantilla),
}))

export const camposPlantillaRelations = relations(camposPlantilla, ({ one, many }) => ({
  plantilla: one(plantillaSilabo, { fields: [camposPlantilla.plantillaId], references: [plantillaSilabo.plantillaId] }),
  seccion: one(seccionesPlantilla, { fields: [camposPlantilla.seccionPlantillaId], references: [seccionesPlantilla.seccionPlantillaId] }),
  definiciones: many(definicionesCampo),
}))

export const definicionesCampoRelations = relations(definicionesCampo, ({ one, many }) => ({
  plantilla: one(plantillaSilabo, { fields: [definicionesCampo.plantillaId], references: [plantillaSilabo.plantillaId] }),
  campo: one(camposPlantilla, { fields: [definicionesCampo.campoPlantillaId], references: [camposPlantilla.campoPlantillaId] }),
  valores: many(valoresCampo),
}))

export const valoresCampoRelations = relations(valoresCampo, ({ one }) => ({
  silabo: one(silabos, { fields: [valoresCampo.silaboId], references: [silabos.silaboId] }),
  asignatura: one(asignaturas, { fields: [valoresCampo.asignaturaId], references: [asignaturas.asignaturaId] }),
  definicion: one(definicionesCampo, { fields: [valoresCampo.definicionCampoId], references: [definicionesCampo.definicionCampoId] }),
}))

export const mensajesIaPlantillaRelations = relations(mensajesIaPlantilla, ({ one }) => ({
  plantilla: one(plantillaSilabo, { fields: [mensajesIaPlantilla.plantillaId], references: [plantillaSilabo.plantillaId] }),
  usuario: one(usuarios, { fields: [mensajesIaPlantilla.usuarioId], references: [usuarios.usuarioId] }),
}))

export const propuestasIaPlantillaRelations = relations(propuestasIaPlantilla, ({ one }) => ({
  plantilla: one(plantillaSilabo, { fields: [propuestasIaPlantilla.plantillaId], references: [plantillaSilabo.plantillaId] }),
  mensaje: one(mensajesIaPlantilla, { fields: [propuestasIaPlantilla.mensajeIaPlantillaId], references: [mensajesIaPlantilla.mensajeIaPlantillaId] }),
  solicitadaPor: one(usuarios, { fields: [propuestasIaPlantilla.solicitadaPor], references: [usuarios.usuarioId] }),
  decididaPor: one(usuarios, { fields: [propuestasIaPlantilla.decididaPor], references: [usuarios.usuarioId] }),
}))

export const notificacionesRelations = relations(notificaciones, ({ one }) => ({
  usuario: one(usuarios, { fields: [notificaciones.usuarioId], references: [usuarios.usuarioId] }),
  periodoAcademico: one(periodosAcademicos, { fields: [notificaciones.periodoAcademicoId], references: [periodosAcademicos.periodoAcademicoId] }),
}))

export const ajustesSistemaRelations = relations(ajustesSistema, ({ one }) => ({
  modificadoPor: one(usuarios, { fields: [ajustesSistema.modificadoPor], references: [usuarios.usuarioId] }),
}))
