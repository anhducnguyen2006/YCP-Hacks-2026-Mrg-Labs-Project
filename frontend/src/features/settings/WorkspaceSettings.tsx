import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Preferences = { reduceMotion: boolean; exportFilename: string; receivingDate: string };
export const defaultPreferences: Preferences = { reduceMotion: false, exportFilename: "mrg-samples.csv", receivingDate: "" };
const storageKey = "mrg-workspace-preferences-v1";
const Context = createContext<{ preferences: Preferences; save: (value: Preferences) => boolean }>({ preferences: defaultPreferences, save: () => false });

function readPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (!value || typeof value !== "object") return defaultPreferences;
    return {
      reduceMotion: value.reduceMotion === true,
      exportFilename: typeof value.exportFilename === "string" && value.exportFilename.trim() ? value.exportFilename : defaultPreferences.exportFilename,
      receivingDate: typeof value.receivingDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.receivingDate) ? value.receivingDate : "",
    };
  } catch { return defaultPreferences; }
}

export function WorkspaceSettingsProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(readPreferences);
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(preferences.reduceMotion);
    return () => { delete document.documentElement.dataset.reduceMotion; };
  }, [preferences.reduceMotion]);
  const save = (value: Preferences) => {
    try { localStorage.setItem(storageKey, JSON.stringify(value)); setPreferences(value); return true; }
    catch { return false; }
  };
  return <Context.Provider value={{ preferences, save }}>{children}</Context.Provider>;
}

export const useWorkspaceSettings = () => useContext(Context);
