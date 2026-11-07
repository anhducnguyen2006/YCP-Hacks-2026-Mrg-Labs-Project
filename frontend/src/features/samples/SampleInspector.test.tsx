import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, test, vi } from "vitest";
import { api, type Sample } from "../../api";
import { SampleInspector } from "./SampleInspector";

vi.mock("../../api", () => ({
  api: { updateField: vi.fn(), mediaUrl: (id: string) => `/api/media/${id}` },
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
  fireEvent.click(screen.getByRole("button", { name: "Edit / verify" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Sample ID" }), { target: { value: "00042" } });
  fireEvent.click(screen.getByRole("button", { name: "Save & verify field" }));
  expect(await screen.findByText("Verification pending")).toBeInTheDocument();
  expect(api.updateField).toHaveBeenCalledWith("sample-1", "sample_id", "00042");
  expect(onSaved).toHaveBeenCalledTimes(1);
});
