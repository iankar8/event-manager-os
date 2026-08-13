import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App";
import "./styles.css";
import "./workspace.css";
import "./workbench.css";
import "./operations.css";
import "./schedule-publish.css";
import "./public.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Event Manager OS could not find its application root.");
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
