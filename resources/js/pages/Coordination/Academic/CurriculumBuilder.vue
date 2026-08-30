<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import { ListTree, Plus, Settings2, Workflow } from '@lucide/vue';
import { ref } from 'vue';
import CurriculumCanvas from '@/components/domain/academic/curriculum/CurriculumCanvas.vue';
import CurriculumConfigurationSheet from '@/components/domain/academic/curriculum/CurriculumConfigurationSheet.vue';
import CurriculumFormView from '@/components/domain/academic/curriculum/CurriculumFormView.vue';
import CurriculumSubjectSheet from '@/components/domain/academic/curriculum/CurriculumSubjectSheet.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { index as curriculaIndex } from '@/routes/coordination/academic/curricula';
import type {
    CurriculumBuilderProps,
    CurriculumBuilderSubject,
} from '@/types/academic';

defineOptions({
    layout: {
        breadcrumbs: [
            { title: 'Mallas', href: curriculaIndex() },
            { title: 'Constructor' },
        ],
    },
});

const props = defineProps<CurriculumBuilderProps>();
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
    <Head :title="`Constructor · ${curriculum.code}`" />

    <PageFrame
        :title="`Constructor · ${curriculum.code}`"
        :description="`Malla de ${career.name}, versión ${curriculum.version_number}. La vista visual y el formulario comparten una sola fuente de verdad.`"
    >
        <template #meta>
            <Badge :variant="curriculum.editable ? 'secondary' : 'outline'">
                {{
                    curriculum.editable
                        ? 'Borrador editable'
                        : 'Publicada · solo lectura'
                }}
            </Badge>
            <Badge variant="outline">{{ curriculum.cycle_count }} ciclos</Badge>
            <Badge variant="outline">{{ subjects.length }} materias</Badge>
        </template>

        <template v-if="curriculum.editable" #actions>
            <Button
                type="button"
                variant="outline"
                @click="configurationOpen = true"
            >
                <Settings2 data-icon="inline-start" aria-hidden="true" />
                Configurar
            </Button>
            <Button type="button" @click="openNewSubject">
                <Plus data-icon="inline-start" aria-hidden="true" />
                Agregar materia
            </Button>
        </template>

        <Alert v-if="!curriculum.editable">
            <Workflow aria-hidden="true" />
            <AlertTitle>Malla publicada e inmutable</AlertTitle>
            <AlertDescription>
                Puede explorar el diagrama y consultar el formulario. Para
                cambiar contenido debe crear otra versión.
            </AlertDescription>
        </Alert>

        <dl
            v-if="fieldTotals.length > 0"
            class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
            aria-label="Totales de la malla"
        >
            <div
                v-for="field in fieldTotals"
                :key="field.id"
                class="rounded-lg border bg-card px-4 py-3 shadow-surface"
            >
                <dt
                    class="text-xs font-medium tracking-wide text-muted-foreground uppercase"
                >
                    Total {{ field.label }}
                </dt>
                <dd class="mt-1 text-xl font-semibold">{{ field.value }}</dd>
            </div>
        </dl>

        <Tabs default-value="visual" class="flex flex-col gap-4">
            <TabsList aria-label="Modo de trabajo de la malla">
                <TabsTrigger value="visual">
                    <Workflow aria-hidden="true" />
                    Constructor visual
                </TabsTrigger>
                <TabsTrigger value="form">
                    <ListTree aria-hidden="true" />
                    Formulario y tablas
                </TabsTrigger>
            </TabsList>
            <TabsContent value="visual">
                <CurriculumCanvas
                    :curriculum="curriculum"
                    :subjects="subjects"
                    :requirements="requirements"
                    @edit="openSubject"
                />
            </TabsContent>
            <TabsContent value="form">
                <CurriculumFormView v-bind="props" @edit="openSubject" />
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
        v-if="curriculum.editable"
        v-model:open="configurationOpen"
        :curriculum="curriculum"
        :field-definitions="fieldDefinitions"
        :system-field-options="systemFieldOptions"
    />
</template>
