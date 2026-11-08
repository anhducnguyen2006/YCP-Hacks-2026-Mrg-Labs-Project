import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { BatchStatus } from "../../api";
import { AnalysisFeedback } from "./AnalysisFeedback";
import { playCompletionChime } from "../../components/uiSounds";

vi.mock("../../components/uiSounds", () => ({playCompletionChime: vi.fn()}));
beforeEach(() => vi.clearAllMocks());

const status = (state: string): BatchStatus => ({total: 1, queued: 0, processing: state === "processing" ? 1 : 0,
  completed: state === "completed" ? 1 : 0, failed: state === "failed" ? 1 : 0, needs_review: 1,
  items: [{id: "sample-1", status: state}]});

test("uses real completed counts, announces completion once and allows dismissal", async () => {
  const view = render(<MantineProvider><AnalysisFeedback batchId="batch-1" status={status("processing")} /></MantineProvider>);
  expect(screen.getByRole("progressbar", {name: "Sample processing progress"})).toHaveAttribute("aria-valuenow", "0");
  expect(screen.queryByText("Analysis complete")).not.toBeInTheDocument();
  view.rerender(<MantineProvider><AnalysisFeedback batchId="batch-1" status={status("completed")} /></MantineProvider>);
  expect(await screen.findByText("Analysis complete")).toBeInTheDocument();
  expect(playCompletionChime).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("link", {name: "Review samples"})).toHaveAttribute("href", "/samples?batch=batch-1");
  expect(screen.getByRole("progressbar", {name: "Sample processing progress"})).toHaveAttribute("aria-valuenow", "1");
  fireEvent.click(screen.getByRole("button", {name: "Dismiss analysis notification"}));
  await waitFor(() => expect(screen.queryByText("Analysis complete")).not.toBeInTheDocument());
  view.rerender(<MantineProvider><AnalysisFeedback batchId="batch-1" status={status("completed")} /></MantineProvider>);
  expect(screen.queryByText("Analysis complete")).not.toBeInTheDocument();
  expect(playCompletionChime).toHaveBeenCalledTimes(1);
});

test("does not celebrate historical scans or present failed analysis as success", async () => {
  const view = render(<MantineProvider><AnalysisFeedback batchId="batch-1" status={status("completed")} /></MantineProvider>);
  expect(screen.queryByText("Analysis complete")).not.toBeInTheDocument();
  view.rerender(<MantineProvider><AnalysisFeedback batchId="batch-1" status={status("processing")} /></MantineProvider>);
  view.rerender(<MantineProvider><AnalysisFeedback batchId="batch-1" status={status("failed")} /></MantineProvider>);
  expect(await screen.findByText("Analysis needs attention")).toBeInTheDocument();
  expect(screen.queryByText("Analysis complete")).not.toBeInTheDocument();
  expect(playCompletionChime).not.toHaveBeenCalled();
});
