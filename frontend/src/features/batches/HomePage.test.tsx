import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test } from "vitest";
import { HomePage } from "./HomePage";
import { WorkspaceSettingsProvider } from "../settings/WorkspaceSettings";

afterEach(() => { cleanup(); localStorage.clear(); });
const mount = () => render(<MantineProvider><MemoryRouter><WorkspaceSettingsProvider><HomePage /></WorkspaceSettingsProvider></MemoryRouter></MantineProvider>);

test("offers working workflow links and pauses the decorative background", () => {
  localStorage.clear();
  mount();
  const hero = screen.getByRole("region", { name: /Less transcription/ });
  expect(hero).toHaveAttribute("data-running", "true");
  expect(screen.getByRole("link", { name: "Start sample intake" })).toHaveAttribute("href", "/scan");
  fireEvent.click(screen.getByRole("button", { name: "Pause background" }));
  expect(hero).toHaveAttribute("data-running", "false");
  fireEvent.click(screen.getByRole("button", { name: "Resume background" }));
  expect(hero).toHaveAttribute("data-running", "true");
});

test("uses a static welcome when reduced motion is saved", () => {
  localStorage.setItem("mrg-workspace-preferences-v1", JSON.stringify({ reduceMotion: true, exportFilename: "mrg-samples.csv", receivingDate: "" }));
  mount();
  expect(screen.getByRole("region", { name: /Less transcription/ })).toHaveAttribute("data-running", "false");
  expect(screen.queryByRole("button", { name: "Pause background" })).not.toBeInTheDocument();
});
