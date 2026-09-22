import React from "react";
import ReactDOM from "react-dom/client";
import "./theme/global.css";
import { RoutedApplication } from "./router/RoutedApplication";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <RoutedApplication />
);
