import { StrictMode } from "react";
import { MantineProvider } from "@mantine/core";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { OiledHelper } from "./OiledHelper";

vi.mock("../uiSounds", () => ({playHelperPop: vi.fn()}));

let blocked = false;
const recordings: FakeAudio[] = [];
class FakeAudio {
  currentTime = 0;
  volume = 1;
  onplay: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeupdate: (() => void) | null = null;
  pause = vi.fn();
  play = vi.fn(() => blocked
    ? Promise.reject(new DOMException("Gesture required", "NotAllowedError"))
    : Promise.resolve().then(() => this.onplay?.()));
  constructor(public src: string) { recordings.push(this); }
}

beforeEach(() => {
  vi.useFakeTimers(); recordings.length = 0; blocked = false;
  vi.stubGlobal("Audio", FakeAudio);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function mount() {
  return render(<StrictMode><MantineProvider><MemoryRouter initialEntries={["/scan"]}>
    <Link to="/samples">Samples tab</Link><OiledHelper />
  </MemoryRouter></MantineProvider></StrictMode>);
}

test("a blocked greeting retries on a gesture, survives StrictMode and does not loop", async () => {
  blocked = true;
  mount();
  await act(async () => { await vi.advanceTimersByTimeAsync(750); });
  expect(recordings).toHaveLength(1);
  expect(recordings[0].src).toContain("greeting.m4a");
  blocked = false;
  await act(async () => { fireEvent.pointerDown(document.body); await Promise.resolve(); });
  expect(recordings).toHaveLength(2);
  expect(recordings[1].src).toContain("greeting.m4a");
  fireEvent.pointerDown(document.body);
  expect(recordings).toHaveLength(2);
  await act(async () => { recordings[1].onended?.(); await vi.advanceTimersByTimeAsync(2500); });
  expect(recordings).toHaveLength(2);
});

test("tab entry plays one guide, tapping replays it and stopped tracks cannot reset it", async () => {
  mount();
  await act(async () => { await vi.advanceTimersByTimeAsync(750); });
  await act(async () => { fireEvent.click(screen.getByRole("link", {name: "Samples tab"})); await Promise.resolve(); });
  expect(recordings).toHaveLength(2);
  expect(recordings[1].src).toContain("samples.m4a");
  expect(recordings[0].pause).toHaveBeenCalledTimes(1);
  act(() => { recordings[0].onended?.(); });
  await act(async () => { fireEvent.click(screen.getByRole("button", {name: "Interact with Oiled Helper"})); await Promise.resolve(); });
  expect(recordings).toHaveLength(3);
  expect(recordings[2].src).toContain("samples.m4a");
  expect(recordings[1].pause).toHaveBeenCalledTimes(1);
});
