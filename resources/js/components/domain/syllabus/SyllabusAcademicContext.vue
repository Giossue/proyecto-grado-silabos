<script setup lang="ts">
import { computed } from 'vue';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';

const props = defineProps<{
    variables: Record<string, string>;
}>();

type ContextItem = {
    label: string;
    value: string;
};

type ContextGroup = {
    title: string;
    items: ContextItem[];
};

const value = (key: string): string =>
    props.variables[key]?.trim() || 'Dato no disponible';

const groups = computed<ContextGroup[]>(() => [
    {
        title: 'Asignatura',
        items: [
            { label: 'Nombre', value: value('nombre_asignatura') },
            { label: 'Código', value: value('codigo_asignatura') },
            { label: 'Carrera', value: value('nombre_carrera') },
            { label: 'Facultad', value: value('nombre_facultad') },
        ],
    },
    {
        title: 'Oferta académica',
        items: [
            { label: 'Período', value: value('nombre_periodo_academico') },
            { label: 'Campus', value: value('nombre_campus') },
            { label: 'Modalidad', value: value('modalidad_estudio') },
            { label: 'Ciclo', value: value('ciclo_asignatura') },
            { label: 'Paralelo', value: value('codigo_paralelo') },
            { label: 'Jornada', value: value('jornada_paralelo') },
        ],
    },
    {
        title: 'Carga académica',
        items: [
            {
                label: 'Unidad curricular',
                value: value('unidad_organizacion_curricular'),
            },
            { label: 'Horas ACD', value: value('horas_docencia') },
            { label: 'Horas APE', value: value('horas_practicas') },
            { label: 'Horas AA', value: value('horas_autonomas') },
            { label: 'Total de horas', value: value('horas_totales') },
            { label: 'Créditos', value: value('creditos_asignatura') },
        ],
    },
    {
        title: 'Relaciones y responsables',
        items: [
            {
                label: 'Prerrequisitos',
                value: value('prerrequisitos_asignatura'),
            },
            {
                label: 'Correquisitos',
                value: value('correquisitos_asignatura'),
            },
            { label: 'Docente', value: value('nombre_docente') },
            { label: 'Correo', value: value('correo_docente') },
        ],
    },
]);
</script>

<template>
    <Card>
        <CardHeader>
            <CardTitle>Contexto académico</CardTitle>
            <CardDescription>
                Estos datos provienen de la planificación académica y son de
                solo lectura.
            </CardDescription>
        </CardHeader>
        <CardContent class="grid gap-6 md:grid-cols-2 2xl:grid-cols-4">
            <section
                v-for="group in groups"
                :key="group.title"
                class="flex min-w-0 flex-col gap-3"
            >
                <h4 class="text-sm font-medium">{{ group.title }}</h4>
                <dl class="flex flex-col gap-3">
                    <div
                        v-for="item in group.items"
                        :key="item.label"
                        class="min-w-0"
                    >
                        <dt class="text-xs text-muted-foreground">
                            {{ item.label }}
                        </dt>
                        <dd class="text-sm font-medium break-words">
                            {{ item.value }}
                        </dd>
                    </div>
                </dl>
            </section>
        </CardContent>
    </Card>
</template>
