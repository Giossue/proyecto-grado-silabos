import { describe, expect, it } from 'vitest';
import { ANIMATIONS, EXPRESSIONS, headRadius, interpolate, renderFrame, sample, startPlayback } from './blobGeometry';

describe('blobGeometry', () => {
    it('proyecta ojos simétricos de frente y los oculta si giran hacia atrás', () => {
        const front = renderFrame(EXPRESSIONS.neutral);
        expect(front.left.visible).toBe(true);
        expect(front.right.visible).toBe(true);
        expect(front.left.path).not.toBe(front.right.path);
        const back = renderFrame({ ...EXPRESSIONS.neutral, headY: 180 });
        expect(back.left.visible).toBe(false);
    });

    it('el parpadeo aplana los ojos', () => {
        const open = renderFrame(EXPRESSIONS.neutral, 1).left.path;
        const closed = renderFrame(EXPRESSIONS.neutral, 0).left.path;
        const height = (path: string): number => {
            const ys = [...path.matchAll(/-?\d+(?:\.\d+)?\s(-?\d+(?:\.\d+)?)/g)].map((match) => Number(match[1]));
            return Math.max(...ys) - Math.min(...ys);
        };
        expect(height(closed)).toBeLessThan(height(open) / 3);
    });

    it('interpola suavemente y recorre los pasos de la animación', () => {
        const half = interpolate(EXPRESSIONS.neutral, EXPRESSIONS.surprised, 0.5);
        expect(half.widthLeft).toBeGreaterThan(EXPRESSIONS.neutral.widthLeft);
        expect(half.widthLeft).toBeLessThan(EXPRESSIONS.surprised.widthLeft);

        const state = startPlayback('idle', 0, EXPRESSIONS.neutral);
        const first = ANIMATIONS.idle.steps[0]!;
        const during = sample(state, first.transitionMs / 2, () => 0);
        expect(during.state.phase).toBe('transition');
        const held = sample(state, first.transitionMs + 10, () => 0);
        expect(held.state.phase).toBe('hold');
        expect(held.expression).toEqual(EXPRESSIONS[first.expression]);
        const nextStep = sample(state, first.transitionMs + first.holdMs + 10, () => 0);
        expect(nextStep.state.stepIndex).toBe(1);
        const blinkAt = ANIMATIONS.idle.blink.initialDelayMs + ANIMATIONS.idle.blink.durationMs / 2;
        expect(sample(state, blinkAt, () => 0).blink).toBeLessThan(0.2);
    });

    it('la esfera se ve apenas más grande por la perspectiva', () => {
        expect(headRadius()).toBeGreaterThan(120);
        expect(headRadius()).toBeLessThan(126);
    });
});
