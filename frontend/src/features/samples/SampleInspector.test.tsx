import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, test, vi } from "vitest";
import { api, type Sample } from "../../api";
import { SampleInspector } from "./SampleInspector";

vi.mock("../../api", () => ({
  api: { updateField: vi.fn(), verifySample: vi.fn(), reopenSample: vi.fn(), mediaUrl: (id: string) => `/api/media/${id}` },
}));

test("edits a sample field inline, preserving text identifiers and notifying the table", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  const sample: Sample = {
    id: "sample-1", batch_id: "batch-1", external_sample_id: "00123", label_type: "small",
    processing_status: "completed", review_status: "pending", ai_confidence: "high",
    ai_confidence_reason: "The label is clear", created_at: "", updated_at: "",
    media: [], latest_job: null,
    fields: [{
      id: "field-1", field_key: "sample_id", predicted_value: "00123",
      current_value: "00123", confidence: null, confidence_source: null,
      status: "extracted", review_required: true, reviewed: false, review_reason: null,
    }],
  };
  const onSaved = vi.fn();
  vi.mocked(api.updateField).mockResolvedValue({
    ...sample,
    fields: [{ ...sample.fields[0], current_value: "00042", reviewed: true, review_required: false }],
  });
  render(<MantineProvider><QueryClientProvider client={new QueryClient()}>
    <SampleInspector sample={sample} onSaved={onSaved} />
  </QueryClientProvider></MantineProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Edit field" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Sample ID" }), { target: { value: "00042" } });
  fireEvent.click(screen.getByRole("button", { name: "Save change" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(api.updateField).toHaveBeenCalledWith("sample-1", "sample_id", "00042");
  expect(onSaved).toHaveBeenCalledTimes(1);
});

test("verifies the entire sample in a single explicit action", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  const sample: Sample = {
    id: "sample-2", batch_id: "batch-1", external_sample_id: "00010",
    label_type: "small", processing_status: "completed",
    review_status: "pending", ai_confidence: "medium", ai_confidence_reason: null,
    created_at: "", updated_at: "", fields: [], media: [], latest_job: null,
  };
  vi.mocked(api.verifySample).mockResolvedValue({ ...sample, review_status: "verified" });
  const onSaved = vi.fn();
  render(<MantineProvider><QueryClientProvider client={new QueryClient()}>
    <SampleInspector sample={sample} onSaved={onSaved}
      qualityFlags={[{ field_key: "date_sampled", code: "year_outlier", message: "Check year" }]} />
  </QueryClientProvider></MantineProvider>);
  expect(screen.getByText(/date_sampled\s*:\s*Check year/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Verify entire sample" }));
  await waitFor(() => expect(api.verifySample).toHaveBeenCalledWith("sample-2"));
  expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ review_status: "verified" }));
});

test("shows actual per-field OCR recognition scores and distinguishes heuristic scores", () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  const sample: Sample = {
    id: "sample-3", batch_id: "batch-1", external_sample_id: "00123",
    label_type: "small", processing_status: "completed", review_status: "pending",
    ai_confidence: "low", ai_confidence_reason: "Low OCR recognition scores",
    created_at: "", updated_at: "", media: [], latest_job: null,
    fields: [
      { id: "one", field_key: "sample_id", predicted_value: "00123",
        current_value: "00123", confidence: .67, confidence_source: "paddleocr_cpu",
        status: "extracted", review_required: true, reviewed: false,
        review_reason: "Low OCR score" },
      { id: "two", field_key: "component", predicted_value: "5 GS",
        current_value: "5 GS", confidence: .82, confidence_source: "derived_heuristic",
        status: "extracted", review_required: true, reviewed: false,
        review_reason: "Low heuristic score" },
    ],
  };
  render(<MantineProvider><QueryClientProvider client={new QueryClient()}>
    <SampleInspector sample={sample} onSaved={vi.fn()} />
  </QueryClientProvider></MantineProvider>);
  expect(screen.getByText("OCR score 67%")).toBeInTheDocument();
  expect(screen.getByText("Heuristic score 82%")).toBeInTheDocument();
});
