import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, test, vi } from "vitest";
import { TemplatesPage } from "./TemplatesPage";
import { api } from "../../api";
vi.mock("../../api", () => ({ api: { batches: vi.fn(), batchStatus: vi.fn(), exportBatch: vi.fn(), exportPreview: vi.fn(), exportSelected: vi.fn() } }));

test("downloads only the seven required headers and switches label mappings", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.mocked(api.batches).mockResolvedValue([]);
  render(<MantineProvider><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TemplatesPage /></QueryClientProvider></MantineProvider>);
  const download = screen.getByRole("link", { name: "Download blank CSV template" });
  expect(decodeURIComponent(download.getAttribute("href")!.split(",").slice(1).join(","))).toBe("Sample ID,Date Sampled,Date Received,Machine,Component,Serial Number,Refrence Lube\r\n");
  fireEvent.click(screen.getByRole("button", { name: /Label mapping reference/ }));
  expect(await screen.findByText("Equip ID")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "Small sample" }));
  expect(screen.getByText("Circled number + circled GS/NGS")).toBeInTheDocument();
  expect(screen.getByText("SN")).toBeInTheDocument();
});

test("preview loads completed records and supports select-all and deselect", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.mocked(api.batches).mockResolvedValue([{
    id: "batch-1", name: "Batch A", receiving_date: "2026-11-07",
    default_export_filename: "samples.csv", created_at: "", updated_at: "",
  }]);
  vi.mocked(api.batchStatus).mockResolvedValue({
    total: 2, completed: 2, queued: 0, processing: 0, failed: 0,
    needs_review: 1, items: [],
  });
  vi.mocked(api.exportPreview).mockResolvedValue([
    { id: "a", label: "0001", verified: true },
    { id: "b", label: "0002", verified: false },
  ]);
  render(<MantineProvider><QueryClientProvider client={
    new QueryClient({ defaultOptions: { queries: { retry: false } } })
  }><TemplatesPage /></QueryClientProvider></MantineProvider>);

  const batchSelect = screen.getByRole("textbox", { name: "Batch to export" });
  // The select starts disabled while React Query loads batches. Wait for
  // options to become available before opening the Mantine combobox.
  await waitFor(() => expect(batchSelect).toBeEnabled());
  fireEvent.click(batchSelect);
  fireEvent.click(await screen.findByRole("option", { name: "Batch A" }));
  fireEvent.click(screen.getByRole("button", { name: "Preview & select samples" }));
  expect(await screen.findByText("Review samples before export")).toBeInTheDocument();
  expect(await screen.findByText("0001 — Verified")).toBeInTheDocument();
  expect(screen.getByText("0002 — Unverified")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Select all shown" }));
  expect(screen.getByRole("button", { name: "Export 2 selected" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Export 0 selected" })).toBeDisabled());
});
