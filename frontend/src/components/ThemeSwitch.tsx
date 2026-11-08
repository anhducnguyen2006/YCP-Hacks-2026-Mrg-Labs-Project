import { useEffect } from "react";
import { useComputedColorScheme, useMantineColorScheme } from "@mantine/core";
import { Moon, Sun } from "lucide-react";

export function ThemeSwitch() {
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme("light", { getInitialValueInEffect: false });
  const dark = scheme === "dark";

  useEffect(() => {
    // Arm transitions after the first painted frame, never during theme restoration.
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => { document.documentElement.dataset.themeReady = "true"; });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      delete document.documentElement.dataset.themeReady;
    };
  }, []);

  return <button type="button" className="liquid-theme-toggle" role="switch" aria-checked={dark} aria-label="Dark mode" title={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={() => setColorScheme(dark ? "light" : "dark")}>
    <span className="liquid-theme-indicator" aria-hidden="true" />
    <Sun className="liquid-theme-sun" size={18} aria-hidden="true" />
    <Moon className="liquid-theme-moon" size={18} aria-hidden="true" />
  </button>;
}
