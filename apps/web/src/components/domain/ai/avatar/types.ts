export type AvatarMode = 'idle' | 'listening' | 'thinking' | 'speaking';

export type AvatarEmotion = 'neutral' | 'happy' | 'surprised' | 'confused';

export interface AvatarState {
    mode: AvatarMode;
    emotion: AvatarEmotion;
    intensity?: number;
}

export const clampIntensity = (value: number | null | undefined, fallback = 0.6): number =>
    typeof value === 'number' && Number.isFinite(value)
        ? Math.min(1, Math.max(0, value))
        : fallback;
