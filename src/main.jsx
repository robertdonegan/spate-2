import React from "react";
import { createRoot } from "react-dom/client";
import SandboxHydraulics from "./SandboxHydraulics.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SandboxHydraulics />
  </React.StrictMode>
);
