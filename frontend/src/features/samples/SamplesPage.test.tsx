import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { expect, test, vi } from "vitest";
import { api, type Sample } from "../../api";
import { SamplesPage } from "./SamplesPage";

vi.mock("../../api", () => ({
  api: {
    batches: vi.fn(), inventory: vi.fn(), sample: vi.fn(), updateField: vi.fn(), mediaUrl: (id: string) => `/api/media/${id}`,
    deleteSamples: vi.fn(),
  },
}));

test("opens an editable inspector directly from the Samples inventory", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  const sample: Sample = {
    id: "sample-1", batch_id: "batch-1", external_sample_id: "00123", label_type: "small",
    processing_status: "completed", review_status: "pending", ai_confidence: "medium",
    ai_confidence_reason: "Some characters are hard to read.", created_at: "", updated_at: "",
    media: [], latest_job: null,
    fields: [{
      id: "field-1", field_key: "sample_id", predicted_value: "00123",
      current_value: "00123", confidence: null, confidence_source: null,
      status: "extracted", review_required: true, reviewed: false, review_reason: null,
    }],
  };
  vi.mocked(api.batches).mockResolvedValue([{
    id: "batch-1", name: "Test batch", receiving_date: "2026-11-07",
    default_export_filename: "samples.csv", created_at: "", updated_at: "",
  }]);
  vi.mocked(api.inventory).mockResolvedValue({ total: 1, items: [sample] });
  vi.mocked(api.sample).mockResolvedValue(sample);
  const onUpdate = { ...sample, fields: [{ ...sample.fields[0], current_value: "00042", reviewed: true, review_required: false }] };
  vi.mocked(api.updateField).mockResolvedValue(onUpdate);
  render(<MantineProvider><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={["/samples?batch=batch-1"]}><SamplesPage /></MemoryRouter>
  </QueryClientProvider></MantineProvider>);

  fireEvent.click(await screen.findByRole("button", { name: "Inspect / edit" }));

  await screen.findByText("Sample details & verification");
  await screen.findByText("Source video & selected frames");
  fireEvent.click(screen.getByRole("button", { name: "Edit / verify" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Sample ID" }), { target: { value: "00042" } });
  fireEvent.click(screen.getByRole("button", { name: "Save & verify field" }));
  await waitFor(() => expect(api.updateField).toHaveBeenCalledWith("sample-1", "sample_id", "00042"));
  expect(await screen.findByText("Field saved and marked as verified.")).toBeInTheDocument();
});

test("selects all current-page samples and closes the inspector in one action", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  const sample: Sample = {
    id: "sample-1", batch_id: "batch-1", external_sample_id: "00123",
    label_type: "small", processing_status: "completed", review_status: "pending",
    ai_confidence: "high", ai_confidence_reason: null,
    created_at: "", updated_at: "", fields: [], media: [], latest_job: null,
  };
  vi.mocked(api.batches).mockResolvedValue([{
    id: "batch-1", name: "Test batch", receiving_date: "2026-11-07",
    default_export_filename: "samples.csv", created_at: "", updated_at: "",
  }]);
  vi.mocked(api.inventory).mockResolvedValue({ total: 1, items: [sample] });
  vi.mocked(api.sample).mockResolvedValue(sample);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MantineProvider><QueryClientProvider client={client}>
    <MemoryRouter initialEntries={["/samples?batch=batch-1"]}>
      <SamplesPage />
    </MemoryRouter>
  </QueryClientProvider></MantineProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Select all on page (1)" }));
  expect(screen.getByRole("checkbox", { name: "Select sample 00123" })).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Inspect / edit" }));
  expect(await screen.findByText("Sample details & verification")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
  await waitFor(() => expect(screen.queryByText("Sample details & verification")).not.toBeInTheDocument());
});
