<?php

// Catálogo único: clave pública => etiqueta y ruta dentro de la fotografía del sílabo.
// Para exponer otro dato ya fotografiado basta agregar una entrada aquí.
return [
    'nombre_facultad' => ['label' => 'Nombre de la facultad', 'source' => 'identification.faculty'],
    'nombre_carrera' => ['label' => 'Nombre de la carrera', 'source' => 'identification.career'],
    'nombre_asignatura' => ['label' => 'Nombre de la asignatura', 'source' => 'identification.subject'],
    'codigo_asignatura' => ['label' => 'Código de la asignatura', 'source' => 'identification.code'],
    'modalidad_estudio' => ['label' => 'Modalidad de estudio', 'source' => 'identification.modality'],
    'nombre_campus' => ['label' => 'Nombre del campus', 'source' => 'identification.campus'],
    'nombre_periodo_academico' => ['label' => 'Nombre del período académico', 'source' => 'identification.period'],
    'ciclo_asignatura' => ['label' => 'Ciclo de la asignatura', 'source' => 'identification.cycle'],
    'codigo_paralelo' => ['label' => 'Código del paralelo', 'source' => 'identification.parallel'],
    'jornada_paralelo' => ['label' => 'Jornada del paralelo', 'source' => 'identification.shift'],
    'prerrequisitos_asignatura' => ['label' => 'Prerrequisitos de la asignatura', 'source' => 'identification.prerequisites'],
    'correquisitos_asignatura' => ['label' => 'Correquisitos de la asignatura', 'source' => 'identification.corequisites'],
    'unidad_organizacion_curricular' => ['label' => 'Unidad de organización curricular', 'source' => 'identification.organization_unit'],
    'horas_docencia' => ['label' => 'Horas de docencia (ACD)', 'source' => 'identification.hours_ac'],
    'horas_practicas' => ['label' => 'Horas de prácticas (APE)', 'source' => 'identification.hours_pae'],
    'horas_autonomas' => ['label' => 'Horas de aprendizaje autónomo (AA)', 'source' => 'identification.hours_aa'],
    'horas_totales' => ['label' => 'Total de horas del período', 'source' => 'identification.total_hours'],
    'creditos_asignatura' => ['label' => 'Créditos de la asignatura', 'source' => 'identification.credits'],
    'nombre_docente' => ['label' => 'Nombre del docente', 'source' => 'identification.teacher'],
    'correo_docente' => ['label' => 'Correo institucional del docente', 'source' => 'identification.email'],
    'marca_unidad_basica' => ['label' => 'Marca de unidad básica', 'source' => 'identification.organization_unit', 'equals' => 'Unidad Básica'],
    'marca_unidad_profesional' => ['label' => 'Marca de unidad profesional', 'source' => 'identification.organization_unit', 'equals' => 'Unidad Profesional'],
    'marca_unidad_titulacion' => ['label' => 'Marca de unidad de titulación', 'source' => 'identification.organization_unit', 'equals' => 'Unidad de Titulación'],
];
