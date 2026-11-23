import "@testing-library/jest-dom/vitest"

class TestResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver ??= TestResizeObserver;

if (typeof window !== 'undefined') globalThis.Event = window.Event;
