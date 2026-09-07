<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { createDocumentPaginator, LETTER_PAGE } from '@/lib/documentPagination';

const content = ref<HTMLElement | null>(null);
const pages = ref(1);
let frame = 0;
let disposed = false;
let resize: ResizeObserver | undefined;
let mutations: MutationObserver | undefined;
let paginator: ReturnType<typeof createDocumentPaginator> | undefined;

const schedule = () => {
    if (disposed || frame) {
        return;
    }

    frame = requestAnimationFrame(() => {
        frame = 0;
        // Our own spacers must not schedule another pagination pass.
        mutations?.disconnect();
        pages.value = paginator?.paginate() ?? 1;
        observeContent();
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

    paginator = createDocumentPaginator(content.value);
    mutations = new MutationObserver(schedule);
    observeContent();
    resize = new ResizeObserver(schedule);
    resize.observe(content.value);
    content.value.addEventListener('load', schedule, true);
    document.fonts.ready.then(schedule);
    document.fonts.addEventListener('loadingdone', schedule);
    schedule();
});

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
            '--page-width': `${LETTER_PAGE.width}px`,
            '--page-height': `${LETTER_PAGE.height}px`,
            '--page-margin': `${LETTER_PAGE.margin}px`,
            '--page-gap': `${LETTER_PAGE.gap}px`,
            minHeight: `${pages * (LETTER_PAGE.height + LETTER_PAGE.gap) - LETTER_PAGE.gap}px`,
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
    color: #000;
    font-family: Arial, 'Liberation Sans', Helvetica, sans-serif;
    font-size: 11pt;
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
