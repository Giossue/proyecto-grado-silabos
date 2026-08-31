<script setup lang="ts">
import { Inbox } from "@lucide/vue"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { cn } from "@/lib/utils"
import TableCell from "./TableCell.vue"
import TableRow from "./TableRow.vue"

const props = withDefaults(defineProps<{
  class?: HTMLAttributes["class"]
  colspan?: number
}>(), {
  colspan: 1,
})

const delegatedProps = reactiveOmit(props, "class")
</script>

<template>
  <TableRow>
    <TableCell
      :class="
        cn(
          'h-40 p-0 whitespace-normal align-middle',
          props.class,
        )
      "
      v-bind="delegatedProps"
    >
      <Empty class="gap-3 rounded-none border-0 p-6 md:p-10">
        <EmptyHeader class="gap-3">
          <EmptyMedia variant="icon" class="text-muted-foreground">
            <Inbox aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle class="text-sm text-muted-foreground">
            <slot />
          </EmptyTitle>
        </EmptyHeader>
      </Empty>
    </TableCell>
  </TableRow>
</template>
