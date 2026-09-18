import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { routes } from "./app/routes";
import { registerServiceWorker } from "./pwa/register";
import { applyTheme, readTheme } from "./lib/theme";
import { Toaster } from "./components/ui/toast";
import "./index.css";

applyTheme(readTheme());

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 30_000, networkMode: "offlineFirst" },
    mutations: { networkMode: "offlineFirst" },
  },
});

const router = createBrowserRouter(routes);
const root = document.getElementById("root")!;
const app = (
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  </React.StrictMode>
);

ReactDOM.createRoot(root).render(app);

registerServiceWorker();
