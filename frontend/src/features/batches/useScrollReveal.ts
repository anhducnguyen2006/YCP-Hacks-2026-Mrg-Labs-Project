import { useEffect, useRef } from "react";
import { useReducedMotion } from "@mantine/hooks";
import { useWorkspaceSettings } from "../settings/WorkspaceSettings";

export function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const systemReducedMotion = useReducedMotion();
  const { preferences } = useWorkspaceSettings();
  const reducedMotion = systemReducedMotion || preferences.reduceMotion;

  useEffect(() => {
    const root = ref.current;
    if (!root || reducedMotion || !("IntersectionObserver" in window)) return;

    // Only observe page sections, never the portal-mounted modal dialogs.
    const sections = Array.from(root.children).slice(0, 4);
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const section = entry.target as HTMLElement;
        // Keep keyboard-focused controls visible even at the viewport edge.
        section.classList.toggle("scroll-visible", entry.isIntersecting);
      }
    }, { threshold: 0, rootMargin: "-24px 0px -24px 0px" });

    for (const section of sections) {
      const bounds = section.getBoundingClientRect();
      section.classList.toggle("scroll-visible", bounds.bottom > 24 && bounds.top < window.innerHeight - 24);
      section.classList.add("scroll-section");
      observer.observe(section);
    }

    return () => {
      observer.disconnect();
      for (const section of sections) section.classList.remove("scroll-section", "scroll-visible");
    };
  }, [reducedMotion]);

  return ref;
}
