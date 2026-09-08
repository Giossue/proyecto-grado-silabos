<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import {
    computed,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    watch,
} from 'vue';
import TemplateAppearanceSheet from '@/components/domain/configuration/TemplateAppearanceSheet.vue';
import TemplateVisualBuilder from '@/components/domain/configuration/TemplateVisualBuilder.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import ProcessLockAlert from '@/components/domain/ProcessLockAlert.vue';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { index as templatesIndex } from '@/routes/admin/templates';
import type {
    TemplateAppearance,
    TemplateBuilderProps,
} from '@/types/configuration';

const props = defineProps<TemplateBuilderProps>();

defineOptions({
    layout: { breadcrumbs: [{ title: 'Plantilla', href: templatesIndex() }] },
});

const appearanceOpen = ref(false);
const previewAppearance = ref<TemplateAppearance>({
    ...props.template.appearance,
});
const activeSectionId = ref(props.template.sections[0]?.id ?? '');
let sectionObserver: IntersectionObserver | undefined;

const sectionAnchor = (id: string): string => `template-section-${id}`;
const fieldAnchor = (id: string): string => `template-field-${id}`;

const navigationItems = computed(() =>
    props.template.sections.flatMap((section, sectionIndex) => [
        {
            value: `section:${section.id}`,
            target: sectionAnchor(section.id),
            sectionId: section.id,
            label: `${sectionIndex + 1}. ${section.title}`,
        },
        ...section.blocks.map((block, fieldIndex) => ({
            value: `field:${block.id}`,
            target: fieldAnchor(block.id),
            sectionId: section.id,
            label: `${sectionIndex + 1}.${fieldIndex + 1} ${block.title}`,
        })),
    ]),
);

const navigateTo = (target: string, sectionId: string): void => {
    activeSectionId.value = sectionId;
    document.getElementById(target)?.scrollIntoView({
        behavior: 'auto',
        block: 'start',
    });
};

const navigateToSection = (id: string): void => {
    navigateTo(sectionAnchor(id), id);
};

const navigateToField = (fieldId: string, sectionId: string): void => {
    navigateTo(fieldAnchor(fieldId), sectionId);
};

const updateSectionSelect = (value: unknown): void => {
    if (typeof value !== 'string') {
        return;
    }

    const item = navigationItems.value.find((item) => item.value === value);

    if (item) {
        navigateTo(item.target, item.sectionId);
    }
};

const observeSections = async (): Promise<void> => {
    sectionObserver?.disconnect();
    await nextTick();

    const sections = props.template.sections
        .map((section) => document.getElementById(sectionAnchor(section.id)))
        .filter((section): section is HTMLElement => section !== null);

    if (sections.length === 0) {
        activeSectionId.value = '';

        return;
    }

    if (
        !sections.some(
            (section) => section.id === sectionAnchor(activeSectionId.value),
        )
    ) {
        activeSectionId.value = props.template.sections[0]?.id ?? '';
    }

    sectionObserver = new IntersectionObserver(
        (entries) => {
            const visible = entries
                .filter((entry) => entry.isIntersecting)
                .sort(
                    (left, right) =>
                        left.boundingClientRect.top -
                        right.boundingClientRect.top,
                );
            const current = visible[0]?.target.id.replace(
                'template-section-',
                '',
            );

            if (current) {
                activeSectionId.value = current;
            }
        },
        { rootMargin: '-12% 0px -72%', threshold: 0 },
    );

    sections.forEach((section) => sectionObserver?.observe(section));
};

watch(
    () => props.template.appearance,
    (appearance) => {
        previewAppearance.value = { ...appearance };
    },
    { deep: true },
);

watch(
    () => props.template.sections.map((section) => section.id).join(','),
    () => void observeSections(),
    { flush: 'post' },
);

onMounted(() => void observeSections());
onBeforeUnmount(() => sectionObserver?.disconnect());
</script>

<template>
    <Head title="Plantilla" />
    <PageFrame
        title="Plantilla de sílabo"
        description="Hoja base de la plantilla institucional."
        size="wide"
    >
        <template #actions>
            <Button
                v-if="!processLock"
                type="button"
                variant="outline"
                @click="appearanceOpen = true"
            >
                Personalizar
            </Button>
        </template>

        <ProcessLockAlert
            v-if="processLock"
            title="Plantilla protegida durante el proceso"
            :reason="processLock"
        />

        <nav
            v-if="template.sections.length > 0"
            class="mb-4 xl:hidden"
            aria-label="Índice de la plantilla"
        >
            <Select
                :model-value="`section:${activeSectionId}`"
                @update:model-value="updateSectionSelect($event)"
            >
                <SelectTrigger class="w-full">
                    <SelectValue placeholder="Ir a una sección" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem
                        v-for="item in navigationItems"
                        :key="item.value"
                        :value="item.value"
                        :class="
                            item.value.startsWith('field:') ? 'ps-7' : undefined
                        "
                    >
                        {{ item.label }}
                    </SelectItem>
                </SelectContent>
            </Select>
        </nav>

        <div class="xl:grid xl:grid-cols-[15rem_minmax(0,1fr)] xl:gap-6">
            <aside v-if="template.sections.length > 0" class="hidden xl:block">
                <nav
                    class="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto border-e pe-4"
                    aria-label="Índice de la plantilla"
                >
                    <p class="mb-3 text-sm font-medium">Índice</p>
                    <ol class="space-y-1">
                        <li
                            v-for="(section, index) in template.sections"
                            :key="section.id"
                        >
                            <button
                                type="button"
                                class="w-full border-s-2 px-3 py-2 text-left text-sm leading-snug transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                                :class="
                                    activeSectionId === section.id
                                        ? 'border-primary bg-accent font-medium text-foreground'
                                        : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground'
                                "
                                :aria-current="
                                    activeSectionId === section.id
                                        ? 'location'
                                        : undefined
                                "
                                @click="navigateToSection(section.id)"
                            >
                                <span class="me-1 tabular-nums">
                                    {{ index + 1 }}.
                                </span>
                                {{ section.title }}
                            </button>
                            <ol
                                v-if="section.blocks.length > 0"
                                class="mt-1 space-y-1"
                            >
                                <li
                                    v-for="(
                                        block, fieldIndex
                                    ) in section.blocks"
                                    :key="block.id"
                                >
                                    <button
                                        type="button"
                                        class="w-full border-s-2 border-transparent py-1 ps-7 pe-2 text-left text-xs leading-snug text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                                        @click="
                                            navigateToField(
                                                block.id,
                                                section.id,
                                            )
                                        "
                                    >
                                        <span class="me-1 tabular-nums">
                                            {{ index + 1 }}.{{ fieldIndex + 1 }}
                                        </span>
                                        {{ block.title }}
                                    </button>
                                </li>
                            </ol>
                        </li>
                    </ol>
                </nav>
            </aside>

            <TemplateVisualBuilder
                :template="template"
                :appearance="previewAppearance"
                :block-types="blockTypes"
                :variables="variables"
                :identification-design="identificationDesign"
                :color-options="appearanceOptions.colors"
                :readonly="Boolean(processLock)"
            />
        </div>
    </PageFrame>

    <TemplateAppearanceSheet
        v-model:open="appearanceOpen"
        :template-id="template.id"
        :appearance="template.appearance"
        :options="appearanceOptions"
        @preview="previewAppearance = $event"
    />
</template>
