import { fireEvent, render, screen, within } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, test, vi } from "vitest";
import { api, type Sample } from "../../api";
import { ReviewPage, reviewColumns } from "./ReviewPage";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../api", () => ({ api: { batches: vi.fn(), samples: vi.fn(), updateField: vi.fn(), mediaUrl: (id: string) => `/api/media/${id}` } }));

test("shows seven CSV columns and persists a verified string identifier", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  const sample: Sample = {
    id: "sample-1", batch_id: "batch-1", external_sample_id: null, label_type: "large", processing_status: "completed", review_status: "pending", created_at: "", updated_at: "", media: [], latest_job: null,
    fields: reviewColumns.map(({ key }) => ({ id: key, field_key: key, predicted_value: key === "sample_id" ? "00123" : "", current_value: key === "sample_id" ? "00123" : "", confidence: null, confidence_source: null, status: "extracted", review_required: key === "sample_id", reviewed: false, review_reason: null })),
  };
  vi.mocked(api.batches).mockResolvedValue([{ id: "batch-1", name: "Lab batch", receiving_date: "2026-11-07", default_export_filename: "samples.csv", created_at: "", updated_at: "" }]);
  vi.mocked(api.samples).mockResolvedValue([sample]);
  vi.mocked(api.updateField).mockImplementation(async () => ({ ...sample, fields: sample.fields.map((field) => field.field_key === "sample_id" ? { ...field, current_value: "00042", reviewed: true, review_required: false } : field) }));
  render(<MantineProvider><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><ReviewPage /></MemoryRouter></QueryClientProvider></MantineProvider>);
  await screen.findByText("Choose a batch to get started");
  fireEvent.click(screen.getByRole("textbox", { name: "Batch" }));
  fireEvent.click(await screen.findByRole("option", { name: "Lab batch" }));
  const headers = await screen.findAllByRole("columnheader");
  expect(headers.map((header) => header.textContent)).toEqual(reviewColumns.map(({ label }) => label));
  fireEvent.click(screen.getAllByRole("button", { name: "Edit / verify" })[0]);
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Sample ID" }), { target: { value: "00042" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save & verify field" }));
  await screen.findByText("Field saved to the sample record.");
  expect(api.updateField).toHaveBeenCalledWith("sample-1", "sample_id", "00042");
  expect(screen.getByRole("button", { name: "00042" })).toBeInTheDocument();
});
