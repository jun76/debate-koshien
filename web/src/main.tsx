import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AudioProvider } from "./audio";
import { LanguageProvider } from "./i18n";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LanguageProvider>
      <AudioProvider>
        <App />
      </AudioProvider>
    </LanguageProvider>
  </React.StrictMode>,
);
