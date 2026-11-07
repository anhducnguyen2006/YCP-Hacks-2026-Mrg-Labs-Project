import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";

const html = readFileSync("index.html", "utf8");
const initializer = html.match(/<script>([\s\S]*?)<\/script>/)![1];

test.each([
  [null, true, "dark"],
  [null, false, "light"],
  ["light", true, "light"],
  ["dark", false, "dark"],
  ["auto", true, "dark"],
  ["invalid", true, "dark"],
])("restores saved preference %s with system dark=%s before React", (saved, systemDark, expected) => {
  const document = { documentElement: { dataset: {} as Record<string, string> } };
  runInNewContext(initializer, { document, localStorage: { getItem: () => saved }, window: { matchMedia: () => ({ matches: systemDark }) } });
  expect(document.documentElement.dataset.mantineColorScheme).toBe(expected);
});

test("falls back to the system when storage is blocked", () => {
  const document = { documentElement: { dataset: {} as Record<string, string> } };
  runInNewContext(initializer, { document, localStorage: { getItem: () => { throw new Error("Blocked"); } }, window: { matchMedia: () => ({ matches: true }) } });
  expect(document.documentElement.dataset.mantineColorScheme).toBe("dark");
});
