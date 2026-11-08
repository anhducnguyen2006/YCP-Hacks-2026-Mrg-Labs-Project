import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { test, expect, vi } from "vitest";
import { App } from "./App";

test("renders the sample scanner navigation", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async input => new Response(JSON.stringify(
    String(input).endsWith("/auth/me") ? {enabled: false, user: null, workspaces: []}
      : String(input).endsWith("/analysis-gate") ? {hold: null} : []
  ), {status: 200, headers: {"Content-Type": "application/json"}}));
  render(
    <MantineProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><App /></MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
  expect(await screen.findByRole("img", { name: "MRG Laboratories" })).toBeInTheDocument();
  expect(screen.getByText("Export")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Review" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Batches" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "How to use Grease Free Data" })).toBeInTheDocument();
  const desktopMenu = screen.getByRole("button", { name: "Toggle desktop navigation" });
  expect(desktopMenu).toBeInTheDocument();
  fireEvent.click(desktopMenu);
  expect(desktopMenu).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(desktopMenu);
  expect(desktopMenu).toHaveAttribute("aria-expanded", "true");
  const themeSwitch = screen.getByRole("switch", { name: "Dark mode" });
  fireEvent.click(themeSwitch);
  expect(document.documentElement).toHaveAttribute("data-mantine-color-scheme", "dark");
  expect(themeSwitch).toBeChecked();
  fireEvent.click(themeSwitch);
  expect(document.documentElement).toHaveAttribute("data-mantine-color-scheme", "light");
  for (let index = 0; index < 10; index++) fireEvent.click(themeSwitch);
  expect(themeSwitch).not.toBeChecked();
  expect(document.documentElement).toHaveAttribute("data-mantine-color-scheme", "light");
  fetchMock.mockRestore();
});
