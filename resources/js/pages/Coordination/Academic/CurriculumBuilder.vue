<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import { ListTree, Plus, PowerOff, Workflow } from '@lucide/vue';
import { ref } from 'vue';
import CurriculumCanvas from '@/components/domain/academic/curriculum/CurriculumCanvas.vue';
import CurriculumConfigurationSheet from '@/components/domain/academic/curriculum/CurriculumConfigurationSheet.vue';
import CurriculumFormView from '@/components/domain/academic/curriculum/CurriculumFormView.vue';
import CurriculumSubjectSheet from '@/components/domain/academic/curriculum/CurriculumSubjectSheet.vue';
import CurriculumActions from '@/components/domain/academic/CurriculumActions.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
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
const activeMode = ref<'breakdown' | 'builder'>('breakdown');
const subjectSheetOpen = ref(false);
const configurationOpen = ref(false);
const selectedSubject = ref<CurriculumBuilderSubject | null>(null);

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
        :description="`${curriculum.code} · ${career.name}. Edite el desglose académico o trabaje sobre la misma información en el constructor visual.`"
    >
        <template #actions>
            <CurriculumActions :curriculum="curriculum" :options="options" />
            <Button
                type="button"
                variant="outline"
                @click="configurationOpen = true"
            >
                Configurar
            </Button>
            <Button
                v-if="activeMode === 'breakdown'"
                type="button"
                @click="openNewSubject"
            >
                <Plus data-icon="inline-start" aria-hidden="true" />
                Agregar materia
            </Button>
        </template>

        <Alert v-if="!curriculum.active">
            <PowerOff aria-hidden="true" />
            <AlertTitle>Malla deshabilitada</AlertTitle>
            <AlertDescription>
                Puede seguir editándola, pero no se crearán ofertas ni procesos
                nuevos para sus materias hasta reactivarla.
            </AlertDescription>
        </Alert>

        <Tabs v-model="activeMode" class="flex flex-col gap-4">
            <TabsList aria-label="Modo de trabajo de la malla">
                <TabsTrigger value="breakdown">
                    <ListTree aria-hidden="true" />
                    Desglose académico
                </TabsTrigger>
                <TabsTrigger value="builder">
                    <Workflow aria-hidden="true" />
                    Constructor visual
                </TabsTrigger>
            </TabsList>
            <TabsContent value="breakdown" class="flex flex-col gap-6">
                <CurriculumFormView v-bind="props" @edit="openSubject" />
            </TabsContent>
            <TabsContent value="builder">
                <CurriculumCanvas
                    :curriculum="curriculum"
                    :field-definitions="fieldDefinitions"
                    :subjects="subjects"
                    :requirements="requirements"
                />
            </TabsContent>
        </Tabs>
    </PageFrame>

    <CurriculumSubjectSheet
        v-model:open="subjectSheetOpen"
        :curriculum="curriculum"
        :field-definitions="fieldDefinitions"
        :subject="selectedSubject"
    />
    <CurriculumConfigurationSheet
        v-model:open="configurationOpen"
        :curriculum="curriculum"
        :field-definitions="fieldDefinitions"
        :system-field-options="systemFieldOptions"
    />
</template>
