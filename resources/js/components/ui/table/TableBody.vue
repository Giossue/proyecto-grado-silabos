<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { provide } from "vue"
import { cn } from "@/lib/utils"
import { tableSectionKey } from "./context"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()

// Marca la sección para que las filas de dentro sepan que describen un registro.
provide(tableSectionKey, 'body')
</script>

<template>
  <tbody
    data-slot="table-body"
    :class="cn('[&_tr:last-child]:border-0', props.class)"
  >
    <slot />
  </tbody>
</template>
