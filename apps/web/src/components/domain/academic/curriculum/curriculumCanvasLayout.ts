import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type {
    CurriculumBuilderProps,
    CurriculumBuilderSubject,
} from '@/types/academic';

export type RelationMode = 'requires' | 'required-by';

export type RequirementEdgeData = {
    label: string;
    sourceOffset: number;
    targetOffset: number;
    channelIndex: number;
    channelCount: number;
};

export type CurriculumRequirement = CurriculumBuilderProps['requirements'][number];

export const UNIT_PALETTE = [
    { backgroundColor: 'var(--curriculum-unit-1-background)', color: 'var(--curriculum-unit-1-foreground)' },
    { backgroundColor: 'var(--curriculum-unit-2-background)', color: 'var(--curriculum-unit-2-foreground)' },
    { backgroundColor: 'var(--curriculum-unit-3-background)', color: 'var(--curriculum-unit-3-foreground)' },
    { backgroundColor: 'var(--curriculum-unit-4-background)', color: 'var(--curriculum-unit-4-foreground)' },
    { backgroundColor: 'var(--curriculum-unit-5-background)', color: 'var(--curriculum-unit-5-foreground)' },
];
export const FALLBACK_UNIT_STYLE = {
    backgroundColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
};

const ROMAN_NUMERALS = [
    ['X', 10],
    ['IX', 9],
    ['V', 5],
    ['IV', 4],
    ['I', 1],
] as const;

export const toRoman = (value: number): string => {
    let remaining = value;
    let roman = '';
    ROMAN_NUMERALS.forEach(([symbol, amount]) => {
        while (remaining >= amount) {
            roman += symbol;
            remaining -= amount;
        }
    });

    return roman || String(value);
};

export const laneHeight = 238;
export const subjectWidth = 274;
export const subjectGap = 34;
export const CANVAS_ZOOM = { min: 0.2, max: 1 } as const;
export const ZOOM_LEVELS = [0.5, 0.75, 1] as const;
export type ZoomChoice = 'fit' | (typeof ZOOM_LEVELS)[number];
export const laneInset = 16;
export const subjectHeight = 158;
export const addSubjectHeight = 36;
export const subjectOffset = Math.round(
    (laneHeight - laneInset - subjectHeight) / 2,
);
export const addSubjectOffset = Math.round(
    (laneHeight - laneInset - addSubjectHeight) / 2,
);
export const laneStart = 109;
const spanishRole = (role: string) => ({
    'aria-roledescription': role,
    'aria-describedby': undefined,
});
export const subjectStep = subjectWidth + subjectGap;
export const navigationPadding = 48;

type CurriculumNodeOptions = Pick<
    CurriculumBuilderProps,
    'career' | 'curriculum' | 'fixedFields'
> & {
    subjectsForCycle: (cycle: number) => CurriculumBuilderSubject[];
    unitStyleFor: (unit: string | null | undefined) => (typeof UNIT_PALETTE)[number];
    laneWidth: number;
    editable: boolean;
    hasOpenEditor: boolean;
    savingLayout: boolean;
    draggingSubjectId: string | undefined;
    onEdit: (subjectId: string) => void;
    onMove: (subjectId: string, delta: -1 | 1) => void;
    onRelate: (subjectId: string, mode: RelationMode) => void;
    onSaved: (message?: string) => void;
};

export const buildCurriculumNodes = (options: CurriculumNodeOptions): Node[] => {
    const nodes: Node[] = [];

    for (let cycle = 1; cycle <= options.curriculum.cycle_count; cycle += 1) {
        const cycleSubjects = options.subjectsForCycle(cycle);
        nodes.push({
            id: `cycle-${cycle}`,
            type: 'cycle',
            domAttributes: spanishRole('nivel'),
            position: { x: 0, y: (cycle - 1) * laneHeight },
            data: {
                cycle,
                level: toRoman(cycle),
                subjectCount: cycleSubjects.length,
                totalHours: cycleSubjects.reduce(
                    (total, subject) => total + (subject.total_hours ?? 0),
                    0,
                ),
            },
            draggable: false,
            selectable: false,
            connectable: false,
            focusable: false,
            style: {
                width: `${options.laneWidth}px`,
                height: `${laneHeight - laneInset}px`,
            },
            zIndex: -1,
        });

        let x = laneStart;
        cycleSubjects.forEach((subject, subjectIndex) => {
            const cycleY = (cycle - 1) * laneHeight + subjectOffset;
            nodes.push({
                id: subject.id,
                type: 'subject',
                domAttributes: spanishRole('materia'),
                position: {
                    x,
                    y: cycleY,
                },
                data: {
                    career: options.career,
                    curriculum: options.curriculum,
                    fixedFields: options.fixedFields,
                    subject,
                    unitStyle: options.unitStyleFor(subject.organization_unit),
                    editable: options.editable,
                    onEdit: () => options.onEdit(subject.id),
                    canMoveLeft: subjectIndex > 0 && !options.savingLayout,
                    canMoveRight: subjectIndex < cycleSubjects.length - 1 && !options.savingLayout,
                    onMoveLeft: () => options.onMove(subject.id, -1),
                    onMoveRight: () => options.onMove(subject.id, 1),
                    onRelate: (mode: RelationMode) => options.onRelate(subject.id, mode),
                    onSaved: options.onSaved,
                },
                draggable: options.editable && !options.hasOpenEditor && !options.savingLayout,
                extent: [
                    [laneStart, cycleY],
                    [laneStart + cycleSubjects.length * subjectStep, cycleY + laneHeight - laneInset],
                ],
                connectable: options.editable && !options.hasOpenEditor,
                selectable: false,
                style: { width: `${subjectWidth}px` },
                zIndex: options.draggingSubjectId === subject.id ? 10 : 0,
            });
            x += subjectStep;
        });

        if (!options.editable) {
            continue;
        }

        nodes.push({
            id: `add-subject-${cycle}`,
            type: 'addSubject',
            domAttributes: spanishRole('acción'),
            position: {
                x,
                y: (cycle - 1) * laneHeight + addSubjectOffset,
            },
            data: {
                cycle,
                disabled: options.hasOpenEditor || options.savingLayout,
            },
            draggable: false,
            selectable: false,
            connectable: false,
        });
    }

    return nodes;
};

const EDGE_SPACING = 18;

type EdgeGeometry = {
    source: number;
    target: number;
    channelIndex: number;
    channelCount: number;
};

const edgeGeometry = (
    requirements: CurriculumRequirement[],
    subjectById: Map<string, CurriculumBuilderSubject>,
): Map<string, EdgeGeometry> => {
    const columnIndex = new Map<string, number>();
    const byCycle = new Map<number, CurriculumBuilderSubject[]>();
    subjectById.forEach((subject) => {
        const cycle = subject.cycle ?? 0;
        byCycle.set(cycle, [...(byCycle.get(cycle) ?? []), subject]);
    });
    byCycle.forEach((list) => {
        list
            .toSorted((left, right) => left.position - right.position)
            .forEach((subject, index) => columnIndex.set(subject.id, index));
    });
    const columnOf = (subjectId: string): number => columnIndex.get(subjectId) ?? 0;
    const cycleOf = (subjectId: string): number => subjectById.get(subjectId)?.cycle ?? 0;
    const centerX = (subjectId: string): number =>
        laneStart + columnOf(subjectId) * subjectStep + subjectWidth / 2;

    const result = new Map<string, EdgeGeometry>();
    const entry = (id: string): EdgeGeometry => {
        const current = result.get(id) ?? { source: 0, target: 0, channelIndex: 0, channelCount: 1 };
        result.set(id, current);

        return current;
    };

    type End = { requirement: CurriculumRequirement; end: 'source' | 'target'; towards: number };
    const groups = new Map<string, End[]>();
    const push = (key: string, end: End): void => {
        groups.set(key, [...(groups.get(key) ?? []), end]);
    };
    requirements.forEach((requirement) => {
        const sourceId = requirement.requirement_id;
        const targetId = requirement.subject_id;
        const gap = cycleOf(targetId) - 1;
        push(`${gap}:${columnOf(targetId)}`, { requirement, end: 'target', towards: centerX(sourceId) });
        push(`${cycleOf(sourceId)}:${columnOf(sourceId)}`, {
            requirement,
            end: 'source',
            towards: centerX(targetId),
        });
    });
    groups.forEach((ends) => {
        const slots: End[][] = [];
        const seen = new Map<string, End[]>();
        ends.forEach((end) => {
            const straight = columnOf(end.requirement.requirement_id) === columnOf(end.requirement.subject_id)
                && cycleOf(end.requirement.subject_id) - cycleOf(end.requirement.requirement_id) === 1;
            const shared = straight ? seen.get(end.requirement.id) : undefined;
            if (shared) {
                shared.push(end);
                return;
            }
            const slot = [end];
            slots.push(slot);
            if (straight) seen.set(end.requirement.id, slot);
        });
        const own = (slot: End[]): number => centerX(slot[0]!.end === 'source' ? slot[0]!.requirement.requirement_id : slot[0]!.requirement.subject_id);
        const sorted = slots.sort((left, right) => {
            const l = left.length > 1 ? 0 : left[0]!.towards - own(left);
            const r = right.length > 1 ? 0 : right[0]!.towards - own(right);

            return l - r;
        });
        sorted.forEach((slot, index) => {
            const offset = (index - (sorted.length - 1) / 2) * EDGE_SPACING;
            slot.forEach((end) => {
                entry(end.requirement.id)[end.end] = offset;
            });
        });
    });

    const byGap = new Map<number, CurriculumRequirement[]>();
    requirements.forEach((requirement) => {
        const gap = cycleOf(requirement.subject_id) - 1;
        byGap.set(gap, [...(byGap.get(gap) ?? []), requirement]);
    });
    byGap.forEach((group) => {
        const xs = group.map((requirement) => {
            const geometry = entry(requirement.id);

            return {
                id: requirement.id,
                sx: centerX(requirement.requirement_id) + geometry.source,
                tx: centerX(requirement.subject_id) + geometry.target,
            };
        });
        const between = (x: number, a: number, b: number): boolean => x > Math.min(a, b) && x < Math.max(a, b);
        const crossings = (order: number[]): number => {
            let total = 0;
            for (let upper = 0; upper < order.length; upper++) {
                for (let lower = upper + 1; lower < order.length; lower++) {
                    const e = xs[order[upper]!]!;
                    const f = xs[order[lower]!]!;
                    if (between(f.sx, e.sx, e.tx)) total++;
                    if (between(e.tx, f.sx, f.tx)) total++;
                }
            }

            return total;
        };
        const indexes = xs.map((_, index) => index);
        let best = indexes.toSorted((left, right) => xs[left]!.tx - xs[right]!.tx || xs[left]!.sx - xs[right]!.sx);
        if (indexes.length <= 8) {
            let bestScore = crossings(best);
            const permute = (prefix: number[], rest: number[]): void => {
                if (bestScore === 0) return;
                if (rest.length === 0) {
                    const score = crossings(prefix);
                    if (score < bestScore) {
                        bestScore = score;
                        best = prefix;
                    }

                    return;
                }
                rest.forEach((item, index) => {
                    permute([...prefix, item], [...rest.slice(0, index), ...rest.slice(index + 1)]);
                });
            };
            permute([], indexes);
        }
        best.forEach((edgeIndex, channel) => {
            const geometry = entry(xs[edgeIndex]!.id);
            geometry.channelIndex = channel;
            geometry.channelCount = best.length;
        });
    });

    return result;
};

export const buildRequirementEdges = (
    requirements: CurriculumRequirement[],
    subjectById: Map<string, CurriculumBuilderSubject>,
): Edge<RequirementEdgeData>[] => {
    const geometry = edgeGeometry(requirements, subjectById);
    const color = 'var(--curriculum-prerequisite)';
    const label = 'Prerrequisito';

    return requirements.map((requirement) => {
        const offset = geometry.get(requirement.id);
        const nameOf = (id: string) => subjectById.get(id)?.name ?? 'materia';

        return {
            id: requirement.id,
            source: requirement.requirement_id,
            target: requirement.subject_id,
            type: 'requirement',
            ariaLabel: `${label}: ${nameOf(requirement.requirement_id)} → ${nameOf(requirement.subject_id)}`,
            domAttributes: spanishRole('conexión'),
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color,
                width: 16,
                height: 16,
            },
            style: { stroke: color, strokeWidth: 2 },
            data: {
                label,
                sourceOffset: offset?.source ?? 0,
                targetOffset: offset?.target ?? 0,
                channelIndex: offset?.channelIndex ?? 0,
                channelCount: offset?.channelCount ?? 1,
            },
        };
    });
};
