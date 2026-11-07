import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { test, expect } from "vitest";
import { App } from "./App";

test("renders the sample scanner navigation", () => {
  render(
    <MantineProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><App /></MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
  expect(screen.getByRole("img", { name: "MRG Laboratories" })).toBeInTheDocument();
  expect(screen.getByText("Export")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Review" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Batches" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "How to use Sample Scanner" })).toBeInTheDocument();
  const themeSwitch = screen.getByRole("switch", { name: "Dark mode" });
  fireEvent.click(themeSwitch);
  expect(document.documentElement).toHaveAttribute("data-mantine-color-scheme", "dark");
  expect(themeSwitch).toBeChecked();
  fireEvent.click(themeSwitch);
  expect(document.documentElement).toHaveAttribute("data-mantine-color-scheme", "light");
  for (let index = 0; index < 10; index++) fireEvent.click(themeSwitch);
  expect(themeSwitch).not.toBeChecked();
  expect(document.documentElement).toHaveAttribute("data-mantine-color-scheme", "light");
});
