import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { expect, test } from "vitest";
import { FrameGallery } from "./FrameGallery";
import type { SampleMedia } from "../../api";

const frames: SampleMedia[] = [
  {
    id: "late", media_type: "keyframe", mime_type: "image/jpeg",
    metadata_json: { timestamp_seconds: 1.6 },
  },
  {
    id: "original", media_type: "video", mime_type: "video/quicktime",
    metadata_json: {},
  },
  {
    id: "early", media_type: "keyframe", mime_type: "image/jpeg",
    metadata_json: { timestamp_seconds: 0.2 },
  },
];

test("shows time-ordered frames and lets a reviewer select another image", () => {
  render(<MantineProvider><FrameGallery frames={frames} /></MantineProvider>);
  expect(screen.getByRole("img", { name: "Selected sample label frame 1 of 2" }))
    .toHaveAttribute("src", "http://localhost:8000/api/media/early");
  expect(screen.getByRole("status")).toHaveTextContent("0.20s");
  fireEvent.click(screen.getByRole("button", { name: "View frame 2 at 1.60s" }));
  expect(screen.getByRole("img", { name: "Selected sample label frame 2 of 2" }))
    .toHaveAttribute("src", "http://localhost:8000/api/media/late");
  expect(screen.getByRole("button", { name: "View frame 2 at 1.60s" }))
    .toHaveAttribute("aria-pressed", "true");
});

test("shows an empty state when no keyframes are available", () => {
  render(<MantineProvider><FrameGallery frames={[frames[1]]} /></MantineProvider>);
  expect(screen.getByText("No selected frames available yet.")).toBeInTheDocument();
});
