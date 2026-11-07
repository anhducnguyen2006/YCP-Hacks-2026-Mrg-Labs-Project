import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, test, vi } from "vitest";
import { SettingsPage } from "./SettingsPage";
import { WorkspaceSettingsProvider } from "./WorkspaceSettings";
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

test("saves local preferences and restores them when the workspace remounts", () => {
  localStorage.clear();
  const mount = () => render(<MantineProvider><QueryClientProvider client={new QueryClient()}><WorkspaceSettingsProvider><SettingsPage /></WorkspaceSettingsProvider></QueryClientProvider></MantineProvider>);
  const view = mount();
  fireEvent.click(screen.getByLabelText(/Reduce animations/));
  fireEvent.change(screen.getByRole("textbox", { name: "Default CSV filename" }), { target: { value: "lab-intake.csv" } });
  fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
  expect(screen.getByText("Preferences saved on this device.")).toBeInTheDocument();
  expect(document.documentElement.dataset.reduceMotion).toBe("true");
  view.unmount();
  mount();
  expect(screen.getByLabelText(/Reduce animations/)).toBeChecked();
  expect(screen.getByRole("textbox", { name: "Default CSV filename" })).toHaveValue("lab-intake.csv");
  localStorage.clear();
});

test("keeps unsaved edits when browser storage fails", () => {
  localStorage.clear();
  render(<MantineProvider><QueryClientProvider client={new QueryClient()}><WorkspaceSettingsProvider><SettingsPage /></WorkspaceSettingsProvider></QueryClientProvider></MantineProvider>);
  const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
  fireEvent.change(screen.getByRole("textbox", { name: "Default CSV filename" }), { target: { value: "unsaved.csv" } });
  fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Could not save preferences");
  expect(screen.getByRole("textbox", { name: "Default CSV filename" })).toHaveValue("unsaved.csv");
  storage.mockRestore();
});
