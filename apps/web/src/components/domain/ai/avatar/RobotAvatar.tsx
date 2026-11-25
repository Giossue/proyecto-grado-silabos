"use client"

import { useEffect, useRef, useState } from "react"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { cn } from "@/lib/utils"
import { EXPRESSIONS, headRadius, renderFrame, sample, startPlayback, withIntensity, type AnimationKey, type BlobFrame, type Expression } from "./blobGeometry"
import "./RobotAvatar.css"
import { clampIntensity, type AvatarEmotion, type AvatarMode } from "./types"

type RobotAvatarProps = {
  mode?: AvatarMode
  emotion?: AvatarEmotion
  intensity?: number
  className?: string
}

type Shown = { frame: BlobFrame; blinking: boolean }

const RADIUS = headRadius()
const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now())
const schedule = (callback: () => void): number =>
  typeof requestAnimationFrame === "function" ? requestAnimationFrame(callback) : (setTimeout(callback, 16) as unknown as number)
const cancel = (handle: number): void => {
  if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(handle)
  else clearTimeout(handle)
}

export function RobotAvatar({ mode = "idle", emotion = "neutral", intensity = 0.6, className }: RobotAvatarProps) {
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)")
  const animation: AnimationKey = emotion === "neutral" ? mode : emotion
  const [shown, setShown] = useState<Shown>(() => ({ frame: renderFrame(EXPRESSIONS.neutral), blinking: false }))
  const current = useRef<Expression>(EXPRESSIONS.neutral)
  const strength = useRef(intensity)

  useEffect(() => {
    strength.current = intensity
  }, [intensity])

  useEffect(() => {
    let handle = 0
    if (reducedMotion) {
      current.current = EXPRESSIONS.neutral
      handle = schedule(() => setShown({ frame: renderFrame(EXPRESSIONS.neutral), blinking: false }))
      return () => cancel(handle)
    }
    let playback = startPlayback(animation, now(), current.current)
    const tick = (): void => {
      const sampled = sample(playback, now())
      playback = sampled.state
      current.current = sampled.expression
      setShown({ frame: renderFrame(withIntensity(sampled.expression, clampIntensity(strength.current)), sampled.blink), blinking: sampled.blink < 1 })
      handle = schedule(tick)
    }
    handle = schedule(tick)
    return () => cancel(handle)
  }, [animation, reducedMotion])

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="-130 -130 260 260"
      fill="none"
      role="img"
      aria-hidden="true"
      className={cn("robot-avatar", className)}
      data-slot="robot-avatar"
      data-mode={mode}
      data-emotion={emotion}
      data-animation={animation}
      data-blinking={shown.blinking || undefined}
    >
      <g id="robot_motion">
        <g id="robot_root">
          <g id="body">
            <circle id="body_shell" cx="0" cy="0" r={RADIUS.toFixed(1)} fill="var(--avatar-body)" />
          </g>
          <g id="eyes">
            <g id="eye_left">{shown.frame.left.visible ? <path id="eye_left_dot" d={shown.frame.left.path} fill="var(--avatar-outline)" /> : null}</g>
            <g id="eye_right">{shown.frame.right.visible ? <path id="eye_right_dot" d={shown.frame.right.path} fill="var(--avatar-outline)" /> : null}</g>
          </g>
        </g>
      </g>
    </svg>
  )
}
