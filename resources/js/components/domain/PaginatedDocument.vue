<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { createDocumentPaginator, LETTER_PAGE } from '@/lib/documentPagination';

const props = withDefaults(
    defineProps<{
        orientation?: 'portrait' | 'landscape';
        marginCm?: number;
        fontFamily?: string;
        fontSize?: number;
        textColor?: string;
    }>(),
    {
        orientation: 'portrait',
        marginCm: 2.5,
        fontFamily: 'Arial',
        fontSize: 11,
        textColor: '#000000',
    },
);

const page = computed(() => ({
    width:
        props.orientation === 'landscape'
            ? LETTER_PAGE.height
            : LETTER_PAGE.width,
    height:
        props.orientation === 'landscape'
            ? LETTER_PAGE.width
            : LETTER_PAGE.height,
    margin: (props.marginCm * 96) / 2.54,
    gap: LETTER_PAGE.gap,
}));

const content = ref<HTMLElement | null>(null);
const pages = ref(1);
let frame = 0;
let rerun = false;
let disposed = false;
let resize: ResizeObserver | undefined;
let mutations: MutationObserver | undefined;
let paginator: ReturnType<typeof createDocumentPaginator> | undefined;
let measuredWidth = 0;
let measuredHeight = 0;

const rememberContentSize = () => {
    const rect = content.value?.getBoundingClientRect();

    if (!rect) {
        return;
    }

    measuredWidth = rect.width;
    measuredHeight = rect.height;
};

const schedule = () => {
    if (disposed) {
        return;
    }

    if (frame) {
        rerun = true;

        return;
    }

    frame = requestAnimationFrame(() => {
        frame = 0;
        // Our own spacers must not schedule another pagination pass.
        mutations?.disconnect();
        pages.value = paginator?.paginate() ?? 1;
        rememberContentSize();
        observeContent();

        if (rerun) {
            rerun = false;
            schedule();
        }
    });
};

const observeContent = () => {
    if (!content.value) {
        return;
    }

    mutations?.observe(content.value, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        // Selection, focus and drag classes never change document geometry.
        // Observing them caused a full repagination on every editor click.
        attributeFilter: ['style', 'src', 'rowspan', 'colspan'],
    });
};

onMounted(() => {
    if (!content.value) {
        return;
    }

    paginator = createDocumentPaginator(content.value, () => page.value);
    mutations = new MutationObserver(() => {
        if (paginator?.hasGeometryChanged() ?? true) {
            schedule();
        }
    });
    observeContent();
    rememberContentSize();
    resize = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;

        if (
            Math.abs(width - measuredWidth) <= 0.5 &&
            Math.abs(height - measuredHeight) <= 0.5
        ) {
            return;
        }

        measuredWidth = width;
        measuredHeight = height;
        schedule();
    });
    resize.observe(content.value);
    content.value.addEventListener('load', schedule, true);
    document.fonts.ready.then(schedule);
    document.fonts.addEventListener('loadingdone', schedule);
    schedule();
});

watch(page, schedule);

onBeforeUnmount(() => {
    disposed = true;
    cancelAnimationFrame(frame);
    resize?.disconnect();
    mutations?.disconnect();
    content.value?.removeEventListener('load', schedule, true);
    document.fonts.removeEventListener('loadingdone', schedule);
    paginator?.reset();
});
</script>

<template>
    <div
        class="paged-document mx-auto"
        :style="{
            '--page-width': `${page.width}px`,
            '--page-height': `${page.height}px`,
            '--page-margin': `${page.margin}px`,
            '--page-gap': `${page.gap}px`,
            width: `${page.width}px`,
            minHeight: `${pages * (page.height + page.gap) - page.gap}px`,
            color: textColor,
            fontFamily,
            fontSize: `${fontSize}pt`,
        }"
    >
        <div class="paged-document-papers" aria-hidden="true">
            <div v-for="page in pages" :key="page" class="paged-document-paper">
                <span class="paged-document-number">{{ page }}</span>
            </div>
        </div>
        <div ref="content" class="paged-document-content">
            <slot />
        </div>
    </div>
</template>

<style scoped>
/* Fixed paper colors are intentional; this is the document, not app chrome. */
.paged-document {
    position: relative;
    width: var(--page-width);
    padding: var(--page-margin);
    box-sizing: border-box;
    line-height: 1.15;
}

.paged-document-papers {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    gap: var(--page-gap);
    pointer-events: none;
}

.paged-document-paper {
    position: relative;
    height: var(--page-height);
    flex-shrink: 0;
    background: #fff;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
}

.paged-document-number {
    position: absolute;
    right: var(--page-margin);
    bottom: 1cm;
    color: #595959;
    font-size: 9pt;
}

.paged-document-content {
    position: relative;
    display: flow-root;
}
</style>
