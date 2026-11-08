import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import { OiledHelper, buildSpeechChunks, pickFemaleVoice } from "./OiledHelper";
import { playHelperPop } from "../uiSounds";

vi.mock("../uiSounds", () => ({playHelperPop: vi.fn()}));
beforeEach(() => vi.clearAllMocks());

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={["/scan"]}>
        {ui}
      </MemoryRouter>
    </MantineProvider>
  );
}

describe("OiledHelper component", () => {
  it("renders Oiled Helper character and 3-word liquid glass speech bubble", () => {
    renderWithProviders(<OiledHelper />);
    expect(screen.getByLabelText("Oiled Helper Companion")).toBeInTheDocument();
    expect(screen.getByText("Hello there, this")).toBeInTheDocument();
  });

  it("keeps speech bubble outside the character rig so bubble text never turns backwards", () => {
    renderWithProviders(<OiledHelper />);
    const bubble = document.querySelector(".oiled-speech-bubble");
    const rig = document.querySelector(".oiled-character-rig");
    expect(bubble).toBeInTheDocument();
    expect(rig).toBeInTheDocument();
    // Rig does NOT contain the speech bubble (so scaleX flips only the rig)
    expect(rig?.contains(bubble!)).toBe(false);
  });

  it("has microphone OFF by default to avoid speaker feedback loops with toggle button for user", () => {
    renderWithProviders(<OiledHelper />);
    // The toggle button shows Mic: OFF by default
    const micBtn = screen.getByTitle(/Microphone is OFF/i);
    expect(micBtn).toBeInTheDocument();
    expect(micBtn).toHaveTextContent("Mic: OFF");

    // Clicking toggles microphone ON for the user
    fireEvent.click(micBtn);
    expect(screen.getByText("Mic: ON")).toBeInTheDocument();
  });

  it("renders only Mic and Voice buttons in dock with functional mute toggle", () => {
    renderWithProviders(<OiledHelper />);
    const voiceBtn = screen.getByTitle(/Mute Oiled Helper voice/i);
    expect(voiceBtn).toBeInTheDocument();
    expect(voiceBtn).toHaveTextContent("Voice");

    // Toggle voice mute
    fireEvent.click(voiceBtn);
    expect(screen.getByTitle(/Unmute Oiled Helper voice/i)).toBeInTheDocument();
    expect(screen.getByText("Voice: Muted")).toBeInTheDocument();
  });

  it("buildSpeechChunks accurately breaks text into 3-word triplets with synced boundary char offsets", () => {
    const text = "Hello there, I'm Oiled Helper, well-greased. I'm here to provide you any instructions";
    const mapping = buildSpeechChunks(text, 1.05);

    expect(mapping.chunks[0]).toBe("Hello there, I'm");
    expect(mapping.chunks[1]).toBe("Oiled Helper, well-greased.");
    expect(mapping.chunks[2]).toBe("I'm here to");
    expect(mapping.chunks[3]).toBe("provide you any");
    expect(mapping.chunks[4]).toBe("instructions");

    // Exact word boundary synchronization tests
    expect(mapping.getChunkIndexForChar(0)).toBe(0); // "Hello"
    expect(mapping.getChunkIndexForChar(6)).toBe(0); // "there,"
    expect(mapping.getChunkIndexForChar(13)).toBe(0); // "I'm"

    // At character index where "Oiled" starts (index 17 in text)
    const oiledIndex = text.indexOf("Oiled");
    expect(mapping.getChunkIndexForChar(oiledIndex)).toBe(1);

    // At character index where second "I'm" starts
    const secondImIndex = text.indexOf("I'm here");
    expect(mapping.getChunkIndexForChar(secondImIndex)).toBe(2);

    // Dynamic duration includes punctuation pauses
    expect(mapping.durationsMs[1]).toBeGreaterThan(mapping.durationsMs[0]);
  });

  it("pickFemaleVoice strictly selects female voices and never selects male voices like David", () => {
    const mockVoices = [
      { name: "Microsoft David Desktop - English (United States)", lang: "en-US" },
      { name: "Microsoft Zira Desktop - English (United States)", lang: "en-US" },
    ] as SpeechSynthesisVoice[];

    const chosen = pickFemaleVoice(mockVoices);
    expect(chosen).toBeDefined();
    expect(chosen?.name).toContain("Zira");

    // High-definition / Natural voices prioritized over Zira for human-like speech
    const voicesWithNatural = [
      { name: "Microsoft David Desktop - English (United States)", lang: "en-US" },
      { name: "Microsoft Zira Desktop - English (United States)", lang: "en-US" },
      { name: "Google US English", lang: "en-US" },
    ] as SpeechSynthesisVoice[];
    expect(pickFemaleVoice(voicesWithNatural)?.name).toBe("Google US English");

    // Only male voices in pool -> must return null, never David
    const onlyMale = [
      { name: "Microsoft David Desktop - English (United States)", lang: "en-US" },
      { name: "Microsoft Mark - English (United States)", lang: "en-US" },
      { name: "Microsoft George - English (United Kingdom)", lang: "en-GB" },
    ] as SpeechSynthesisVoice[];

    expect(pickFemaleVoice(onlyMale)).toBeNull();
  });

  it("triggers poke interaction and renders droplets layer when touched", () => {
    renderWithProviders(<OiledHelper />);
    const actor = screen.getByTitle(/Click or touch to interact!/i);
    expect(actor).toBeInTheDocument();

    fireEvent.click(actor);
    expect(playHelperPop).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".oiled-droplets-layer")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle(/Mute Oiled Helper voice/i));
    fireEvent.click(actor);
    expect(playHelperPop).toHaveBeenCalledTimes(1);
  });
});
