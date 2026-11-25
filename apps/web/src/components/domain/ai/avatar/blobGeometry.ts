
export type Vec3 = readonly [number, number, number];
type Quaternion = readonly [number, number, number, number];

export interface Expression {
    headX: number;
    headY: number;
    headZ: number;
    widthLeft: number;
    widthRight: number;
    heightLeft: number;
    heightRight: number;
    spacing: number;
    positionY: number;
    leftAngle: number;
    rightAngle: number;
}

export const RADIUS = 120;
const FOCAL_LENGTH = 620;
const QUARTER_ARC_SAMPLES = 10;
const MIN_EYE_HEIGHT = 5;

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

const normalize = ([w, x, y, z]: Quaternion): Quaternion => {
    const length = Math.hypot(w, x, y, z) || 1;
    return [w / length, x / length, y / length, z / length];
};

const multiply = ([aw, ax, ay, az]: Quaternion, [bw, bx, by, bz]: Quaternion): Quaternion =>
    normalize([
        aw * bw - ax * bx - ay * by - az * bz,
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
    ]);

const fromAxisAngle = ([x, y, z]: Vec3, angle: number): Quaternion => {
    const sine = Math.sin(angle / 2);
    return normalize([Math.cos(angle / 2), x * sine, y * sine, z * sine]);
};

const orientationOf = (expression: Expression): Quaternion =>
    multiply(
        multiply(fromAxisAngle([0, 0, 1], radians(expression.headZ)), fromAxisAngle([1, 0, 0], radians(expression.headX))),
        fromAxisAngle([0, 1, 0], radians(expression.headY)),
    );

const rotate = ([w, x, y, z]: Quaternion, [px, py, pz]: Vec3): Vec3 => {
    const tx = 2 * (y * pz - z * py);
    const ty = 2 * (z * px - x * pz);
    const tz = 2 * (x * py - y * px);
    return [
        px + w * tx + (y * tz - z * ty),
        py + w * ty + (z * tx - x * tz),
        pz + w * tz + (x * ty - y * tx),
    ];
};

const project = ([x, y, z]: Vec3): Vec3 => {
    const scale = FOCAL_LENGTH / (FOCAL_LENGTH - z);
    return [x * scale, y * scale, z];
};

const spherePoint = (x: number, y: number): { point: Vec3; normal: Vec3 } => {
    const longitude = x / RADIUS;
    const latitude = y / RADIUS;
    const faceX = RADIUS * Math.cos(latitude) * Math.sin(longitude);
    const faceY = RADIUS * Math.sin(latitude);
    const z = RADIUS * Math.sqrt(Math.max(0, 1 - (faceX / RADIUS) ** 2 - (faceY / RADIUS) ** 2));
    const length = Math.hypot(faceX, faceY, z) || 1;
    return { point: [faceX, faceY, z], normal: [faceX / length, faceY / length, z / length] };
};

const roundedRectangle = (width: number, height: number): Array<readonly [number, number]> => {
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const radius = Math.min(halfWidth, halfHeight);
    const points: Array<readonly [number, number]> = [];
    const line = (start: readonly [number, number], end: readonly [number, number]): void => {
        const samples = Math.max(2, Math.ceil(Math.hypot(end[0] - start[0], end[1] - start[1]) / 2));
        for (let index = 0; index < samples; index += 1) {
            const t = index / samples;
            points.push([start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t]);
        }
    };
    const arc = (centerX: number, centerY: number, startAngle: number): void => {
        for (let index = 0; index < QUARTER_ARC_SAMPLES; index += 1) {
            const angle = startAngle + (index / QUARTER_ARC_SAMPLES) * (Math.PI / 2);
            points.push([centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius]);
        }
    };
    line([-halfWidth + radius, -halfHeight], [halfWidth - radius, -halfHeight]);
    arc(halfWidth - radius, -halfHeight + radius, -Math.PI / 2);
    line([halfWidth, -halfHeight + radius], [halfWidth, halfHeight - radius]);
    arc(halfWidth - radius, halfHeight - radius, 0);
    line([halfWidth - radius, halfHeight], [-halfWidth + radius, halfHeight]);
    arc(-halfWidth + radius, halfHeight - radius, Math.PI / 2);
    line([-halfWidth, halfHeight - radius], [-halfWidth, -halfHeight + radius]);
    arc(-halfWidth + radius, -halfHeight + radius, Math.PI);
    return points;
};

const toPath = (points: Vec3[]): string =>
    points.length === 0
        ? ''
        : `M${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z`;

export interface EyeShape {
    path: string;
    visible: boolean;
}

const eyeShape = (expression: Expression, orientation: Quaternion, side: -1 | 1, blink: number): EyeShape => {
    const width = side < 0 ? expression.widthLeft : expression.widthRight;
    const restingHeight = side < 0 ? expression.heightLeft : expression.heightRight;
    const height = MIN_EYE_HEIGHT + (restingHeight - MIN_EYE_HEIGHT) * blink;
    const angle = radians(side < 0 ? expression.leftAngle : expression.rightAngle);
    const centerX = (side * expression.spacing) / 2;
    const centerY = expression.positionY;
    let facing = 0;
    const points = roundedRectangle(width, height).map(([localX, localY]) => {
        const rotatedX = localX * Math.cos(angle) - localY * Math.sin(angle);
        const rotatedY = localX * Math.sin(angle) + localY * Math.cos(angle);
        const sample = spherePoint(centerX + rotatedX, centerY + rotatedY);
        facing += rotate(orientation, sample.normal)[2];
        return project(rotate(orientation, sample.point));
    });
    return { path: toPath(points), visible: facing > 0 };
};

export const headRadius = (): number => {
    const z = (RADIUS * RADIUS) / FOCAL_LENGTH;
    return Math.sqrt(RADIUS * RADIUS - z * z) * (FOCAL_LENGTH / (FOCAL_LENGTH - z));
};

export interface BlobFrame {
    left: EyeShape;
    right: EyeShape;
}

export const renderFrame = (expression: Expression, blink = 1): BlobFrame => {
    const orientation = orientationOf(expression);
    return {
        left: eyeShape(expression, orientation, -1, blink),
        right: eyeShape(expression, orientation, 1, blink),
    };
};

export const smoothstep = (value: number): number => {
    const t = Math.min(1, Math.max(0, value));
    return t * t * (3 - 2 * t);
};

export const interpolate = (from: Expression, to: Expression, progress: number): Expression => {
    const t = smoothstep(progress);
    const mix = (a: number, b: number): number => a + (b - a) * t;
    return {
        headX: mix(from.headX, to.headX),
        headY: mix(from.headY, to.headY),
        headZ: mix(from.headZ, to.headZ),
        widthLeft: mix(from.widthLeft, to.widthLeft),
        widthRight: mix(from.widthRight, to.widthRight),
        heightLeft: mix(from.heightLeft, to.heightLeft),
        heightRight: mix(from.heightRight, to.heightRight),
        spacing: mix(from.spacing, to.spacing),
        positionY: mix(from.positionY, to.positionY),
        leftAngle: mix(from.leftAngle, to.leftAngle),
        rightAngle: mix(from.rightAngle, to.rightAngle),
    };
};

export const withIntensity = (expression: Expression, intensity: number): Expression => {
    const factor = 0.55 + 0.45 * intensity;
    return { ...expression, headX: expression.headX * factor, headY: expression.headY * factor, headZ: expression.headZ * factor };
};

const eyes = (width: number, height: number, spacing: number, angle = 0, positionY = 0) => ({
    widthLeft: width, widthRight: width, heightLeft: height, heightRight: height, spacing, positionY, leftAngle: angle, rightAngle: -angle,
});

export const EXPRESSIONS = {
    neutral: { headX: 0, headY: 0, headZ: 0, ...eyes(26, 48, 64, 0, -24) },
    restA: { headX: 2, headY: 5, headZ: -3, ...eyes(26, 48, 64, 0, -24) },
    restB: { headX: -2, headY: -5, headZ: 3, ...eyes(25, 50, 63, 0, -23) },
    listenA: { headX: 0, headY: 4, headZ: 6, ...eyes(27, 54, 64, 0, -22) },
    listenB: { headX: 2, headY: -4, headZ: 4, ...eyes(26, 52, 64, 0, -23) },
    glanceUp: { headX: 7, headY: 28, headZ: -16, ...eyes(22, 42, 54, 0, -20) },
    curious: { headX: -12, headY: -18, headZ: 6, ...eyes(21, 48, 55, 24) },
    attentive: { headX: 1, headY: 6, headZ: 11, ...eyes(24, 58, 57) },
    small: { headX: -4, headY: 14, headZ: 11, ...eyes(22, 40, 51) },
    gazeDown: { headX: -15, headY: 0, headZ: -14, ...eyes(22, 55, 58) },
    gentleDown: { headX: -6, headY: -11, headZ: -14, ...eyes(23, 59, 56) },
    frown: { headX: -15, headY: -19, headZ: 6, ...eyes(20, 49, 55, -28) },
    skepticalLeft: { headX: 3, headY: -7, headZ: 10, widthLeft: 24, widthRight: 49, heightLeft: 59, heightRight: 13, spacing: 62, positionY: 0, leftAngle: 0, rightAngle: 0 },
    skepticalRight: { headX: -16, headY: -4, headZ: -14, widthLeft: 49, widthRight: 23, heightLeft: 12, heightRight: 58, spacing: 56, positionY: 0, leftAngle: 0, rightAngle: 0 },
    playful: { headX: -4, headY: 14, headZ: -16, ...eyes(19, 43, 52, 26) },
    joyfulWide: { headX: -2, headY: -16, headZ: -14, ...eyes(34, 84, 59) },
    joyfulDown: { headX: -15, headY: 15, headZ: 13, ...eyes(31, 77, 69) },
    surprised: { headX: 3, headY: -16, headZ: -21, ...eyes(52, 52, 71) },
    surprisedWide: { headX: -5, headY: -12, headZ: -13, ...eyes(50, 50, 69) },
} as const satisfies Record<string, Expression>;

export type ExpressionKey = keyof typeof EXPRESSIONS;

export interface AnimationStep {
    expression: ExpressionKey;
    holdMs: number;
    transitionMs: number;
}

export interface Animation {
    steps: AnimationStep[];
    blink: { initialDelayMs: number; minIntervalMs: number; maxIntervalMs: number; durationMs: number };
}

const steps = (keys: ExpressionKey[], holdMs: number, transitionMs = 500): AnimationStep[] =>
    keys.map((expression) => ({ expression, holdMs, transitionMs }));

export const ANIMATIONS = {
    idle: { steps: steps(['restA', 'restB'], 4200, 900), blink: { initialDelayMs: 2600, minIntervalMs: 3400, maxIntervalMs: 6200, durationMs: 280 } },
    listening: { steps: steps(['listenA', 'listenB'], 2600, 700), blink: { initialDelayMs: 3200, minIntervalMs: 4800, maxIntervalMs: 7200, durationMs: 240 } },
    thinking: { steps: steps(['curious', 'frown', 'skepticalLeft', 'playful', 'skepticalRight'], 2300), blink: { initialDelayMs: 2100, minIntervalMs: 2800, maxIntervalMs: 5000, durationMs: 260 } },
    speaking: { steps: steps(['listenA', 'restA', 'listenB'], 900, 350), blink: { initialDelayMs: 1500, minIntervalMs: 2400, maxIntervalMs: 4200, durationMs: 220 } },
    happy: { steps: steps(['joyfulDown', 'joyfulWide', 'playful', 'gentleDown'], 2300), blink: { initialDelayMs: 2100, minIntervalMs: 2800, maxIntervalMs: 5000, durationMs: 260 } },
    surprised: { steps: steps(['surprised', 'surprisedWide'], 2300), blink: { initialDelayMs: 1200, minIntervalMs: 1800, maxIntervalMs: 3600, durationMs: 220 } },
    confused: { steps: steps(['skepticalLeft', 'skepticalRight', 'curious'], 2300), blink: { initialDelayMs: 2100, minIntervalMs: 2800, maxIntervalMs: 5000, durationMs: 260 } },
} as const satisfies Record<string, Animation>;

export type AnimationKey = keyof typeof ANIMATIONS;

export interface PlaybackState {
    animation: AnimationKey;
    stepIndex: number;
    phase: 'transition' | 'hold';
    phaseStartedAt: number;
    from: Expression;
    blinkDueAt: number;
    blinkStartedAt: number | null;
}

export const startPlayback = (animation: AnimationKey, now: number, from: Expression): PlaybackState => ({
    animation,
    stepIndex: 0,
    phase: 'transition',
    phaseStartedAt: now,
    from,
    blinkDueAt: now + ANIMATIONS[animation].blink.initialDelayMs,
    blinkStartedAt: null,
});

export interface SampledFrame {
    expression: Expression;
    blink: number;
    state: PlaybackState;
}

export const sample = (state: PlaybackState, now: number, random: () => number = Math.random): SampledFrame => {
    const animation = ANIMATIONS[state.animation];
    let next = { ...state };
    let step = animation.steps[next.stepIndex] ?? animation.steps[0]!;

    for (let guard = 0; guard < 16; guard += 1) {
        const duration = next.phase === 'transition' ? step.transitionMs : step.holdMs;
        if (now - next.phaseStartedAt < duration) break;
        if (next.phase === 'transition') {
            next = { ...next, phase: 'hold', phaseStartedAt: next.phaseStartedAt + duration, from: EXPRESSIONS[step.expression] };
        } else {
            const stepIndex = (next.stepIndex + 1) % animation.steps.length;
            next = { ...next, phase: 'transition', stepIndex, phaseStartedAt: next.phaseStartedAt + duration, from: EXPRESSIONS[step.expression] };
            step = animation.steps[stepIndex]!;
        }
    }

    const target = EXPRESSIONS[step.expression];
    const expression = next.phase === 'transition'
        ? interpolate(next.from, target, (now - next.phaseStartedAt) / step.transitionMs)
        : target;

    if (now >= next.blinkDueAt) {
        const { minIntervalMs, maxIntervalMs, durationMs } = animation.blink;
        next = {
            ...next,
            blinkStartedAt: next.blinkDueAt,
            blinkDueAt: next.blinkDueAt + durationMs + minIntervalMs + random() * (maxIntervalMs - minIntervalMs),
        };
    }
    let blink = 1;
    if (next.blinkStartedAt !== null) {
        const progress = (now - next.blinkStartedAt) / animation.blink.durationMs;
        blink = progress >= 0 && progress < 1 ? Math.abs(progress * 2 - 1) : 1;
    }

    return { expression, blink, state: next };
};
