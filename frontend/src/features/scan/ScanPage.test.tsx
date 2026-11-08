import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { expect, test, vi } from "vitest";
import { api } from "../../api";
import { ScanPage } from "./ScanPage";

vi.mock("../../api", () => ({ api: { batches: vi.fn(), createBatch: vi.fn(), sample: vi.fn(), batchStatus: vi.fn(), analysisGate: vi.fn() } }));

test("creates a batch with the receiving date before enabling upload", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  const batch = { id: "batch-1", name: "Morning intake", receiving_date: "2026-11-07", default_export_filename: "mrg-samples.csv", created_at: "", updated_at: "" };
  vi.mocked(api.batches).mockResolvedValue([]);
  vi.mocked(api.createBatch).mockResolvedValue(batch);
  vi.mocked(api.analysisGate).mockResolvedValue({ hold: null });
  vi.mocked(api.batchStatus).mockResolvedValue({
    total: 0, queued: 0, processing: 0, completed: 0, failed: 0,
    needs_review: 0, items: [],
  });
  render(<MantineProvider><QueryClientProvider client={new QueryClient()}><MemoryRouter><ScanPage /></MemoryRouter></QueryClientProvider></MantineProvider>);
  expect(screen.getByText("Select or create a batch above to enable video upload.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "New batch" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Batch name" }), { target: { value: " Morning intake " } });
  fireEvent.change(screen.getByLabelText(/Date received/), { target: { value: "2026-11-07" } });
  fireEvent.click(screen.getByRole("button", { name: "Create batch" }));
  await screen.findByRole("textbox", { name: "Active batch" });
  expect(api.createBatch).toHaveBeenCalledWith({ name: "Morning intake", receiving_date: "2026-11-07", default_export_filename: "mrg-samples.csv" });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Drop sample videos or browse files" })).toBeInTheDocument()
  );
});
