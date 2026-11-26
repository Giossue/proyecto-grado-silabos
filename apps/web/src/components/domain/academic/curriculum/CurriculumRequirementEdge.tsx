"use client"

import { BaseEdge, EdgeLabelRenderer, useReactFlow, type Edge, type EdgeProps } from "@xyflow/react"
import { useState, type MouseEvent } from "react"
import { laneHeight, subjectHeight, type RequirementEdgeData } from "@/components/domain/academic/curriculum/curriculumCanvasLayout"

const LEVEL_GAP = laneHeight - subjectHeight
const CHANNEL_MARGIN = 12

export type RequirementEdge = Edge<RequirementEdgeData, "requirement">

export const requirementPath = (props: Pick<EdgeProps<RequirementEdge>, "sourceX" | "sourceY" | "targetX" | "targetY"> & { data: RequirementEdgeData }): [string, number, number] => {
  const { data } = props
  const sourceX = props.sourceX + data.sourceOffset
  const targetX = props.targetX + data.targetOffset
  if (Math.abs(sourceX - targetX) < 0.5) return [`M ${sourceX} ${props.sourceY} V ${props.targetY}`, sourceX, (props.sourceY + props.targetY) / 2]
  const usable = LEVEL_GAP - CHANNEL_MARGIN * 2
  const step = usable / (data.channelCount + 1)
  const channelY = props.targetY - LEVEL_GAP + CHANNEL_MARGIN + step * (data.channelIndex + 1)

  return [`M ${sourceX} ${props.sourceY} V ${channelY} H ${targetX} V ${props.targetY}`, (sourceX + targetX) / 2, channelY]
}

export function CurriculumRequirementEdge({ id, sourceX, sourceY, targetX, targetY, data, style, markerEnd }: EdgeProps<RequirementEdge>) {
  const { screenToFlowPosition } = useReactFlow()
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null)
  if (!data) return null
  const [path, labelX, labelY] = requirementPath({ sourceX, sourceY, targetX, targetY, data })

  const onHoverMove = (event: MouseEvent): void => setHoverPoint(screenToFlowPosition({ x: event.clientX, y: event.clientY }))

  return (
    <>
      <g
        className="cursor-pointer focus:outline-hidden"
        onMouseEnter={onHoverMove}
        onMouseMove={onHoverMove}
        onMouseLeave={() => setHoverPoint(null)}
        onFocus={() => setHoverPoint({ x: labelX, y: labelY })}
        onBlur={() => setHoverPoint(null)}
      >
        <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} interactionWidth={24} />
      </g>
      <EdgeLabelRenderer>
        {hoverPoint ? (
          <div
            className="pointer-events-none absolute z-10 rounded-md bg-card px-2 py-1 text-curriculum-edge text-card-foreground shadow-menu ring-1 ring-surface-ring"
            style={{ transform: `translate(-50%, -150%) translate(${hoverPoint.x}px, ${hoverPoint.y}px)` }}
          >
            {data.label}
          </div>
        ) : null}
      </EdgeLabelRenderer>
    </>
  )
}
