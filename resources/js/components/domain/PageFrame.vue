<script setup lang="ts">
import type { Component } from 'vue';
import { computed } from 'vue';
import { cn } from '@/lib/utils';

const props = withDefaults(
    defineProps<{
        icon: Component;
        title: string;
        description: string;
        size?: 'full' | 'wide' | 'narrow';
    }>(),
    {
        size: 'full',
    },
);

const widthClass = computed(
    () =>
        ({
            full: '',
            wide: 'mx-auto w-full max-w-6xl',
            narrow: 'mx-auto w-full max-w-4xl',
        })[props.size],
);
</script>

<template>
    <div
        :class="
            cn(
                'flex min-w-0 flex-col gap-6 overflow-x-hidden p-4 sm:p-6',
                widthClass,
            )
        "
    >
        <header
            class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
        >
            <div class="flex min-w-0 flex-1 flex-col gap-2">
                <div v-if="$slots.eyebrow" class="-mt-1">
                    <slot name="eyebrow" />
                </div>

                <div class="flex min-w-0 items-start gap-3">
                    <div
                        class="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-card text-card-foreground shadow-control"
                        aria-hidden="true"
                    >
                        <component :is="icon" class="size-5" />
                    </div>

                    <div class="flex min-w-0 flex-col gap-1">
                        <h1 class="text-2xl font-semibold tracking-tight">
                            {{ title }}
                        </h1>
                        <p class="max-w-3xl text-muted-foreground">
                            {{ description }}
                        </p>
                        <div
                            v-if="$slots.meta"
                            class="flex flex-wrap items-center gap-2 pt-1"
                        >
                            <slot name="meta" />
                        </div>
                    </div>
                </div>
            </div>

            <div
                v-if="$slots.actions"
                class="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end"
            >
                <slot name="actions" />
            </div>
        </header>

        <slot />
    </div>
</template>
