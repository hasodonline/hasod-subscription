import React from "react";
import ReactDOM from "react-dom/client";
import { LanguageProvider } from "./i18n";
import App from "./App";
import FloatingButton from "./FloatingButton";

// Check URL params to determine which window to render
const urlParams = new URLSearchParams(window.location.search);
const windowType = urlParams.get('window');

const RootComponent = windowType === 'floating' ? FloatingButton : App;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LanguageProvider>
      <RootComponent />
    </LanguageProvider>
  </React.StrictMode>,
);
