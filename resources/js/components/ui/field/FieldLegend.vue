<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
  variant?: "legend" | "label"
  required?: boolean
}>()
</script>

<template>
  <legend
    data-slot="field-legend"
    :data-variant="variant"
    :class="cn(
      'mb-3 font-medium',
      'data-[variant=legend]:text-base',
      'data-[variant=label]:text-sm',
      props.class,
    )"
  >
    <slot />
    <span v-if="props.required" class="ml-1 text-destructive" aria-hidden="true">*</span>
    <span v-if="props.required" class="sr-only">(obligatorio)</span>
  </legend>
</template>
