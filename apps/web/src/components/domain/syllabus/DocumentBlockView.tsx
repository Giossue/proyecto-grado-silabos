"use client"

import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { DocumentBlockContent } from "@/components/domain/syllabus/DocumentBlockContent"
import { variableLabels } from "@/components/domain/syllabus/fieldDocumentExtensions"
import { blockAttrs } from "@/lib/blocks/runtime"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"

export function DocumentBlockView({ node, editor, extension, updateAttributes }: NodeViewProps) {
  const attrs = blockAttrs(node as unknown as DocumentNode)
  const mode = !editor.isEditable ? "read" : extension.options.mode === "configure" ? "configure" : "fill"

  return (
    <NodeViewWrapper as="div" data-block data-kind={attrs.kind} contentEditable={false} className="document-block">
      <DocumentBlockContent
        kind={attrs.kind}
        blockProps={attrs.props}
        value={attrs.value}
        mode={mode}
        labels={variableLabels(editor)}
        onValueChange={(value) => updateAttributes({ value })}
        onPropsChange={(next) => updateAttributes({ props: next })}
      />
    </NodeViewWrapper>
  )
}
