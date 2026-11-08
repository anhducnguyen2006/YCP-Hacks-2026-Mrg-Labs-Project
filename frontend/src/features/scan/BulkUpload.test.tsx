import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, test, vi } from "vitest";
import { api, type Sample } from "../../api";
import { BulkUpload } from "./BulkUpload";

vi.mock("../../api", () => ({
  api: { uploadSample: vi.fn(), analyze: vi.fn(), batchStatus: vi.fn(), cancelQueued: vi.fn(), analysisGate: vi.fn(), resumePaused: vi.fn() },
}));

// Clear spy call histories between scenarios without removing their implementations.
beforeEach(() => vi.clearAllMocks());

test("selects multiple videos and automatically enqueues analysis after upload", async () => {
  vi.mocked(api.analysisGate).mockResolvedValue({ hold: null });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.mocked(api.uploadSample).mockResolvedValue({ id: "sample-1" } as Sample);
  vi.mocked(api.analyze).mockResolvedValue({ id: "sample-1" } as Sample);
  vi.mocked(api.batchStatus).mockResolvedValue({
    total: 1, queued: 0, processing: 0, completed: 1, failed: 0,
    needs_review: 1, items: [{ id: "sample-1", status: "completed" }],
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MantineProvider><QueryClientProvider client={qc}>
    <BulkUpload batchId="batch-1" />
  </QueryClientProvider></MantineProvider>);
  const file = new File(["sample"], "label.mov", { type: "video/quicktime" });
  fireEvent.change(screen.getByLabelText("Select multiple sample videos"), {
    target: { files: [file] },
  });
  expect(screen.getByText("label.mov")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Upload & analyze" }));
  await waitFor(() => {
    expect(api.uploadSample).toHaveBeenCalledWith("batch-1", file);
    expect(api.analyze).toHaveBeenCalledWith("sample-1");
  });
  await waitFor(() => expect(screen.getByText("1 completed")).toBeInTheDocument());
});

test("cancel queued analyses is separate from already running work", async () => {
  vi.mocked(api.analysisGate).mockResolvedValue({ hold: null });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.mocked(api.batchStatus).mockResolvedValue({
    total: 3, queued: 2, processing: 1, completed: 0, failed: 0,
    needs_review: 0, items: [],
  });
  vi.mocked(api.cancelQueued).mockResolvedValue({ canceled: 2 });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MantineProvider><QueryClientProvider client={qc}>
    <BulkUpload batchId="batch-1" />
  </QueryClientProvider></MantineProvider>);
  // The cancel control is shown after choosing uploads; it never aborts active work.
  const files = [new File(["x"], "one.mov", { type: "video/quicktime" })];
  fireEvent.change(screen.getByLabelText("Select multiple sample videos"), { target: { files } });
  fireEvent.click(await screen.findByRole("button", { name: "Cancel queued analyses (2)" }));
  await waitFor(() => expect(api.cancelQueued).toHaveBeenCalledWith("batch-1"));
  expect(await screen.findByText(/2 queued analysis job\(s\) canceled/)).toBeInTheDocument();
});

test("quota hold warns and resumes paused scans without uploading a video again", async () => {
  vi.mocked(api.analysisGate).mockResolvedValue({
    hold: { reason: "quota", seconds_remaining: 1800 },
  });
  vi.mocked(api.batchStatus).mockResolvedValue({
    total: 2, queued: 0, processing: 0, completed: 0, failed: 0,
    canceled: 0, paused: 2, needs_review: 0,
    items: [{ id: "one", status: "paused" }, { id: "two", status: "paused" }],
  });
  vi.mocked(api.resumePaused).mockResolvedValue({ resumed: 2, failed: 0 });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MantineProvider><QueryClientProvider client={client}>
    <BulkUpload batchId="batch-1" />
  </QueryClientProvider></MantineProvider>);
  expect(await screen.findByText("Gemini rate or quota limit detected")).toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: "Resume paused analyses" }));
  await waitFor(() => expect(api.resumePaused).toHaveBeenCalledWith("batch-1"));
  expect(api.uploadSample).not.toHaveBeenCalled();
});
