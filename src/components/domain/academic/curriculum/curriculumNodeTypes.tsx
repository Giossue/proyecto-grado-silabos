"use client"

import type { EdgeTypes, NodeProps, NodeTypes, Node } from "@xyflow/react"
import { createContext, useContext } from "react"
import { CurriculumAddSubjectNode, type AddSubjectNodeData } from "@/components/domain/academic/curriculum/CurriculumAddSubjectNode"
import { CurriculumCycleNode, type CycleNodeData } from "@/components/domain/academic/curriculum/CurriculumCycleNode"
import { CurriculumRequirementEdge } from "@/components/domain/academic/curriculum/CurriculumRequirementEdge"
import { CurriculumSubjectNode, type SubjectNodeData } from "@/components/domain/academic/curriculum/CurriculumSubjectNode"

export const CurriculumAddContext = createContext<(cycle: number) => void>(() => undefined)

function CycleNode({ data }: NodeProps<Node<CycleNodeData>>) {
  return <CurriculumCycleNode data={data} />
}

function SubjectNode({ data, dragging }: NodeProps<Node<SubjectNodeData>>) {
  return <CurriculumSubjectNode data={data} dragging={dragging} />
}

function AddSubjectNode({ data }: NodeProps<Node<AddSubjectNodeData>>) {
  const onAdd = useContext(CurriculumAddContext)

  return <CurriculumAddSubjectNode data={data} onAdd={onAdd} />
}

export const curriculumNodeTypes: NodeTypes = { cycle: CycleNode, subject: SubjectNode, addSubject: AddSubjectNode }

export const curriculumEdgeTypes: EdgeTypes = { requirement: CurriculumRequirementEdge }
