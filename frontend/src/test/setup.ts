import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// With Vitest's imported lifecycle hooks (globals disabled), Testing Library
// does not register its own automatic cleanup. Keep tests isolated.
afterEach(() => cleanup());

// jsdom has no media playback engine. Audio event/error behavior is exercised
// separately with controllable recordings in OiledHelper.playback.test.tsx.
vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});

// Mantine Select and ScrollArea depend on ResizeObserver; jsdom does not implement it.
vi.stubGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});
