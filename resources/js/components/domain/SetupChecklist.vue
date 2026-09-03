<script setup lang="ts">
import { Link } from '@inertiajs/vue3';
import { ArrowRight, Check, Circle } from '@lucide/vue';
import { computed } from 'vue';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';

export type SetupStep = {
    key: string;
    label: string;
    hint: string;
    done: boolean;
    href: string;
};

export type Setup = {
    title: string;
    intro: string;
    done: number;
    total: number;
    steps: SetupStep[];
};

/**
 * Puesta en marcha: qué falta, en orden. El siguiente paso lleva su botón; los
 * hechos quedan tachados; los demás esperan. Desaparece cuando todo está hecho.
 */
const props = defineProps<{ setup: Setup }>();

const nextKey = computed(
    () => props.setup.steps.find((step) => !step.done)?.key ?? null,
);
const percent = computed(() =>
    props.setup.total === 0
        ? 0
        : Math.round((props.setup.done / props.setup.total) * 100),
);
</script>

<template>
    <Card v-if="setup.total > 0 && setup.done < setup.total">
        <CardHeader>
            <CardTitle>{{ setup.title }}</CardTitle>
            <CardDescription v-if="setup.intro">{{
                setup.intro
            }}</CardDescription>
            <div class="flex items-center gap-3 pt-1">
                <div
                    class="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    :aria-valuenow="setup.done"
                    :aria-valuemin="0"
                    :aria-valuemax="setup.total"
                    :aria-label="`${setup.done} de ${setup.total} pasos`"
                >
                    <div
                        class="h-full rounded-full bg-primary transition-[width]"
                        :style="{ width: `${percent}%` }"
                    />
                </div>
                <span class="text-sm text-muted-foreground tabular-nums">
                    {{ setup.done }} de {{ setup.total }}
                </span>
            </div>
        </CardHeader>
        <CardContent>
            <ol class="flex flex-col gap-2">
                <li
                    v-for="(step, index) in setup.steps"
                    :key="step.key"
                    class="flex items-start gap-3 rounded-lg p-2"
                    :class="{
                        'bg-muted/60 ring-1 ring-border': step.key === nextKey,
                    }"
                >
                    <span
                        class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium"
                        :class="
                            step.done
                                ? 'bg-primary text-primary-foreground'
                                : step.key === nextKey
                                  ? 'bg-foreground text-background'
                                  : 'bg-muted text-muted-foreground'
                        "
                    >
                        <Check
                            v-if="step.done"
                            class="size-3.5"
                            aria-hidden="true"
                        />
                        <template v-else>{{ index + 1 }}</template>
                    </span>
                    <div class="min-w-0 flex-1">
                        <p
                            class="text-sm font-medium"
                            :class="{
                                'text-muted-foreground line-through': step.done,
                            }"
                        >
                            {{ step.label }}
                        </p>
                        <p
                            v-if="!step.done"
                            class="text-sm text-muted-foreground"
                        >
                            {{ step.hint }}
                        </p>
                    </div>
                    <Button
                        v-if="step.key === nextKey"
                        as-child
                        size="sm"
                        class="shrink-0"
                    >
                        <Link :href="step.href">
                            Ir
                            <ArrowRight
                                data-icon="inline-end"
                                aria-hidden="true"
                            />
                        </Link>
                    </Button>
                    <Circle
                        v-else-if="!step.done"
                        class="mt-1 size-3 shrink-0 text-muted-foreground/50"
                        aria-hidden="true"
                    />
                </li>
            </ol>
        </CardContent>
    </Card>
</template>
