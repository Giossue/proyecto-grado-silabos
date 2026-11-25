import { useEffect, useState } from "react"
import { clampIntensity, type AvatarEmotion, type AvatarMode, type AvatarState } from "./types"

export type ChatLifecycleSignals = {
  userEngaged: boolean
  awaitingModel: boolean
  receivedCount: number
}

type Feeling = { emotion: AvatarEmotion; intensity: number | undefined; token: number }

const SPEAKING_MS = 1800
const EMOTION_HOLD_MS = 6000

const modeOf = ({ awaitingModel, userEngaged }: ChatLifecycleSignals): AvatarMode => {
  if (awaitingModel) return "thinking"
  if (userEngaged) return "listening"
  return "idle"
}

export function useAvatarController(signals: ChatLifecycleSignals) {
  const [previous, setPrevious] = useState(signals)
  const [speaking, setSpeaking] = useState(0)
  const [feeling, setFeeling] = useState<Feeling>({ emotion: "neutral", intensity: 0.6, token: 0 })

  if (previous.awaitingModel !== signals.awaitingModel || previous.userEngaged !== signals.userEngaged || previous.receivedCount !== signals.receivedCount) {
    setPrevious(signals)
    if (signals.awaitingModel && !previous.awaitingModel) setFeeling((current) => ({ ...current, emotion: "neutral", token: current.token + 1 }))
    const finished = !signals.awaitingModel && previous.awaitingModel
    const arrived = signals.receivedCount > previous.receivedCount && signals.awaitingModel
    if (finished || arrived) setSpeaking((current) => current + 1)
  }

  useEffect(() => {
    if (speaking === 0) return
    const timer = setTimeout(() => setSpeaking(0), SPEAKING_MS)
    return () => clearTimeout(timer)
  }, [speaking])

  useEffect(() => {
    if (feeling.emotion === "neutral") return
    const timer = setTimeout(() => setFeeling((current) => ({ ...current, emotion: "neutral", token: current.token + 1 })), EMOTION_HOLD_MS)
    return () => clearTimeout(timer)
  }, [feeling.emotion, feeling.token])

  const setEmotion = (emotion: AvatarEmotion, intensity?: number): void =>
    setFeeling((current) => ({ emotion, intensity: clampIntensity(intensity, current.intensity), token: current.token + 1 }))

  const state: AvatarState = { mode: speaking ? "speaking" : modeOf(signals), emotion: feeling.emotion, intensity: feeling.intensity }

  return { state, setEmotion }
}
