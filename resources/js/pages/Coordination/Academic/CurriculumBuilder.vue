<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import { Link2, ListTree, Plus, PowerOff, Workflow } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import CurriculumCanvas from '@/components/domain/academic/curriculum/CurriculumCanvas.vue';
import CurriculumConfigurationSheet from '@/components/domain/academic/curriculum/CurriculumConfigurationSheet.vue';
import CurriculumFormView from '@/components/domain/academic/curriculum/CurriculumFormView.vue';
import CurriculumRequirementSheet from '@/components/domain/academic/curriculum/CurriculumRequirementSheet.vue';
import CurriculumSubjectSheet from '@/components/domain/academic/curriculum/CurriculumSubjectSheet.vue';
import CurriculumActions from '@/components/domain/academic/CurriculumActions.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import ProcessLockAlert from '@/components/domain/ProcessLockAlert.vue';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { index as curriculaIndex } from '@/routes/coordination/academic/curricula';
import type {
    CurriculumBuilderProps,
    CurriculumBuilderSubject,
} from '@/types/academic';

defineOptions({
    layout: {
        breadcrumbs: [{ title: 'Malla', href: curriculaIndex() }],
    },
});

const props = defineProps<CurriculumBuilderProps>();

/*
 * El modo de trabajo se guarda en la dirección: al recargar —o al volver por un
 * enlace compartido— se sigue en la vista donde se estaba. Se reescribe la entrada
 * actual del historial en vez de añadir una nueva, para que «atrás» siga llevando a
 * la pantalla anterior y no a la otra pestaña de esta misma.
 */
const INTERACTIVE_MODE_PARAM = 'interactivo';

const modeFromUrl = (): 'breakdown' | 'builder' =>
    new URL(window.location.href).searchParams.get('modo') ===
    INTERACTIVE_MODE_PARAM
        ? 'builder'
        : 'breakdown';

const activeMode = ref<'breakdown' | 'builder'>(modeFromUrl());

watch(activeMode, (mode) => {
    const url = new URL(window.location.href);

    if (mode === 'builder') {
        url.searchParams.set('modo', INTERACTIVE_MODE_PARAM);
    } else {
        url.searchParams.delete('modo');
    }

    window.history.replaceState(window.history.state, '', url);
});
const subjectSheetOpen = ref(false);
const requirementSheetOpen = ref(false);
const configurationOpen = ref(false);
const selectedSubject = ref<CurriculumBuilderSubject | null>(null);
const organizationUnits = computed(() =>
    Array.from(
        new Set(
            props.subjects
                .map((subject) => subject.organization_unit?.trim())
                .filter((unit): unit is string => Boolean(unit)),
        ),
    ).sort((left, right) => left.localeCompare(right, 'es')),
);

const openNewSubject = (): void => {
    selectedSubject.value = null;
    subjectSheetOpen.value = true;
};

const openSubject = (subject: CurriculumBuilderSubject): void => {
    selectedSubject.value = subject;
    subjectSheetOpen.value = true;
};
</script>

<template>
    <Head title="Malla" />

    <PageFrame
        title="Malla"
        :description="`${curriculum.code} · ${career.name}. Edite el desglose académico o trabaje sobre la misma información en el modo interactivo.`"
    >
        <template #actions>
            <Button
                v-if="
                    activeMode === 'breakdown' &&
                    curriculum.editable &&
                    subjects.length > 1
                "
                type="button"
                variant="outline"
                @click="requirementSheetOpen = true"
            >
                <Link2 data-icon="inline-start" aria-hidden="true" />
                Agregar relación
            </Button>
            <Button
                v-if="activeMode === 'breakdown' && curriculum.editable"
                type="button"
                @click="openNewSubject"
            >
                <Plus data-icon="inline-start" aria-hidden="true" />
                Agregar materia
            </Button>
        </template>

        <ProcessLockAlert
            v-if="curriculum.lock_reason"
            title="Malla protegida durante la convocatoria"
            :reason="curriculum.lock_reason"
        />

        <Alert v-if="!curriculum.active">
            <PowerOff aria-hidden="true" />
            <AlertTitle>Malla deshabilitada</AlertTitle>
            <AlertDescription>
                Puede seguir editándola, pero no se crearán ofertas ni procesos
                nuevos para sus materias hasta reactivarla.
            </AlertDescription>
        </Alert>

        <Tabs v-model="activeMode" class="flex flex-col gap-4">
            <div class="flex items-center justify-between gap-2">
                <TabsList aria-label="Modo de trabajo de la malla">
                    <TabsTrigger value="breakdown">
                        <ListTree aria-hidden="true" />
                        Desglose académico
                    </TabsTrigger>
                    <TabsTrigger value="builder">
                        <Workflow aria-hidden="true" />
                        Interactivo
                    </TabsTrigger>
                </TabsList>
                <CurriculumActions
                    :curriculum="curriculum"
                    @configure="configurationOpen = true"
                />
            </div>
            <TabsContent value="breakdown" class="flex flex-col gap-6">
                <CurriculumFormView v-bind="props" @edit="openSubject" />
            </TabsContent>
            <TabsContent value="builder">
                <CurriculumCanvas
                    :curriculum="curriculum"
                    :field-definitions="fieldDefinitions"
                    :field-totals="fieldTotals"
                    :subjects="subjects"
                    :requirements="requirements"
                    :organization-units="organizationUnits"
                />
            </TabsContent>
        </Tabs>
    </PageFrame>

    <CurriculumSubjectSheet
        v-model:open="subjectSheetOpen"
        :curriculum="curriculum"
        :field-definitions="fieldDefinitions"
        :subject="selectedSubject"
        :organization-units="organizationUnits"
    />
    <CurriculumRequirementSheet
        v-model:open="requirementSheetOpen"
        :curriculum="curriculum"
        :subjects="subjects"
    />
    <CurriculumConfigurationSheet
        v-model:open="configurationOpen"
        :curriculum="curriculum"
        :field-definitions="fieldDefinitions"
        :system-field-options="systemFieldOptions"
    />
</template>
