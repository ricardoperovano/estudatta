import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

const apiTarget = process.env.API_URL || "http://localhost:8020";

export default defineConfig(() => ({
  plugins: [
    react(),
    VitePWA({
        registerType: "prompt",
        strategies: "injectManifest",
        srcDir: "src/pwa",
        filename: "sw.ts",
        injectRegister: false,
        manifest: {
          id: "/app",
          name: "Estudatta",
          short_name: "Estudatta",
          description: "Saiba o que fazer hoje. Retome quando atrasar.",
          lang: "pt-BR",
          dir: "ltr",
          start_url: "/app",
          scope: "/",
          display: "standalone",
          display_override: ["standalone", "minimal-ui"],
          orientation: "portrait",
          background_color: "#161826",
          theme_color: "#161826",
          categories: ["education", "productivity"],
          icons: [
            { src: "/marca/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/marca/icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "/marca/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
            { src: "/marca/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
          shortcuts: [
            { name: "Começar sessão", url: "/app/sessao?iniciar=1", icons: [{ src: "/marca/icon-192.png", sizes: "192x192" }] },
            { name: "Registrar tempo", url: "/app?registrar=1", icons: [{ src: "/marca/icon-192.png", sizes: "192x192" }] },
          ],
        },
        injectManifest: {
          globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
          globIgnores: ["**/sw.mjs"],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        },
        devOptions: { enabled: false, type: "module" },
      }),
  ],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: {
    port: 5180,
    strictPort: true,
    proxy: { "/api": { target: apiTarget, changeOrigin: false } },
  },
  build: {
    sourcemap: false,
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router"],
          query: ["@tanstack/react-query"],
          icons: ["@phosphor-icons/react"],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
}));
