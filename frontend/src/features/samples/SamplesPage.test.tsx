import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { expect, test, vi } from "vitest";
import { api, type Sample } from "../../api";
import { SamplesPage } from "./SamplesPage";

vi.mock("../../api", () => ({
  api: {
    batches: vi.fn(), inventory: vi.fn(), sample: vi.fn(), updateField: vi.fn(), mediaUrl: (id: string) => `/api/media/${id}`,
    deleteSamples: vi.fn(), batchQuality: vi.fn(), verifySample: vi.fn(), reopenSample: vi.fn(),
  },
}));

const uploadedSample: Sample = {
  id: "new-upload", batch_id: "batch-2", external_sample_id: "NEW-001",
  label_type: "large", processing_status: "completed",
  review_status: "pending", ai_confidence: null, ai_confidence_reason: null, created_at: "", updated_at: "",
  fields: [{id: "new-field", field_key: "sample_id", current_value: "NEW-001", predicted_value: "NEW-001", confidence: null, confidence_source: null, status: "extracted", review_required: true, reviewed: false, review_reason: null}],
  media: [], latest_job: null,
};

test("opens the upload batch and refreshes a cached empty inventory without searching", async () => {
  const batches = ["batch-1", "batch-2"].map(id => ({id, name: id, receiving_date: "2026-11-08", default_export_filename: "samples.csv", created_at: "", updated_at: ""}));
  vi.mocked(api.batches).mockResolvedValue(batches);
  vi.mocked(api.inventory).mockResolvedValue({total: 1, items: [uploadedSample]});
  vi.mocked(api.batchQuality).mockResolvedValue({consensus_year: null, scanned: 1, flags: {}});
  const client = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity}}});
  client.setQueryData(["active-batch"], "batch-2");
  client.setQueryData(["batches"], batches);
  client.setQueryData(["inventory", "batch-2", "", "all", "all", "created_at", "desc", 0, false], {total: 0, items: []});
  render(<MantineProvider><QueryClientProvider client={client}><MemoryRouter initialEntries={["/samples"]}><SamplesPage /></MemoryRouter></QueryClientProvider></MantineProvider>);
  expect(await screen.findByText("NEW-001")).toBeInTheDocument();
  expect(screen.getByRole("textbox", {name: "Choose batch"})).toHaveValue("batch-2");
  expect(screen.getByRole("textbox", {name: "Search all samples in this batch"})).toHaveValue("");
});

test("discovers an arriving upload while Samples stays open without changing search", async () => {
  vi.useFakeTimers();
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  vi.mocked(api.batches).mockResolvedValue([{id: "batch-2", name: "Upload batch", receiving_date: "2026-11-08", default_export_filename: "samples.csv", created_at: "", updated_at: ""}]);
  vi.mocked(api.inventory).mockResolvedValue({total: 0, items: []});
  vi.mocked(api.batchQuality).mockResolvedValue({consensus_year: null, scanned: 0, flags: {}});
  const view = render(<MantineProvider><QueryClientProvider client={client}><MemoryRouter initialEntries={["/samples?batch=batch-2"]}><SamplesPage /></MemoryRouter></QueryClientProvider></MantineProvider>);
  try {
    await act(async () => { await vi.advanceTimersByTimeAsync(30); });
    expect(screen.queryByText("NEW-001")).not.toBeInTheDocument();
    vi.mocked(api.inventory).mockResolvedValue({total: 1, items: [uploadedSample]});
    await act(async () => { await vi.advanceTimersByTimeAsync(5100); });
    expect(screen.getByText("NEW-001")).toBeInTheDocument();
  } finally {
    view.unmount(); client.clear(); vi.useRealTimers();
  }
});

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
  vi.mocked(api.batchQuality).mockResolvedValue({ consensus_year: null, scanned: 1, flags: {} });
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
  fireEvent.click(screen.getByRole("button", { name: "Edit field" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Sample ID" }), { target: { value: "00042" } });
  fireEvent.click(screen.getByRole("button", { name: "Save change" }));
  await waitFor(() => expect(api.updateField).toHaveBeenCalledWith("sample-1", "sample_id", "00042"));
  expect(await screen.findByText("Change saved. Verify the complete sample after checking its original label.")).toBeInTheDocument();
});

test("selects all current-page samples and closes the inspector in one action", async () => {
  vi.mocked(api.batchQuality).mockResolvedValue({ consensus_year: null, scanned: 1, flags: {} });
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
