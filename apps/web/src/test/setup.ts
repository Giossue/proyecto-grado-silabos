import "@testing-library/jest-dom/vitest"
import { notifyManager } from "@tanstack/react-query"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"
import { getQueryClient } from "@/lib/queryClient"

notifyManager.setScheduler((callback) => callback());

class TestResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver ??= TestResizeObserver;

if (typeof window !== 'undefined') {
  globalThis.Event = window.Event;

  window.matchMedia ??= (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });

  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
  document.elementFromPoint ??= () => null;

  afterEach(() => {
    cleanup();
    getQueryClient().clear();
  });
}
