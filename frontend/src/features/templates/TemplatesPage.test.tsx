import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, test, vi } from "vitest";
import { TemplatesPage } from "./TemplatesPage";
import { api } from "../../api";
vi.mock("../../api", () => ({ api: { batches: vi.fn(), batchStatus: vi.fn(), exportBatch: vi.fn() } }));

test("downloads only the seven required headers and switches label mappings", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.mocked(api.batches).mockResolvedValue([]);
  render(<MantineProvider><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TemplatesPage /></QueryClientProvider></MantineProvider>);
  const download = screen.getByRole("link", { name: "Download blank CSV template" });
  expect(decodeURIComponent(download.getAttribute("href")!.split(",").slice(1).join(","))).toBe("Sample ID,Date Sampled,Date Received,Machine,Component,Serial Number,Reference Lube\r\n");
  fireEvent.click(screen.getByRole("button", { name: /Label mapping reference/ }));
  expect(await screen.findByText("Equip ID")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "Small sample" }));
  expect(screen.getByText("Circled number + circled GS/NGS")).toBeInTheDocument();
  expect(screen.getByText("SN")).toBeInTheDocument();
});
