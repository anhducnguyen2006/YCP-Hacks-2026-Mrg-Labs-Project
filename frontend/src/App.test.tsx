import { render, screen } from "@testing-library/react";
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
  expect(screen.getByText("Templates & Export")).toBeInTheDocument();
});
