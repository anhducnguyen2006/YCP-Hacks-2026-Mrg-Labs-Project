import "@mantine/core/styles.css";
import "./styles.css";
import "./dark-mode.css";
import "./theme-transition.css";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const queryClient = new QueryClient();

export function Root() {
  return (
    <MantineProvider defaultColorScheme="auto">
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </MantineProvider>
  );
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Unable to mount MRG Sample Scanner: #root element is missing");
}

createRoot(rootElement).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

export default Root;
