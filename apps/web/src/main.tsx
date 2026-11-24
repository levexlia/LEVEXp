import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./theme/levex-x.css";
import "./theme/levex-scene18.css";
import "./theme/levex-empty.css";
import "./theme/levex-hint.css";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("root missing");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
