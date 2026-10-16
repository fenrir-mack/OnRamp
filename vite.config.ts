import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const isDevelopment = mode === "development";

  return {
    base: "/",
    build: {
      sourcemap: isDevelopment ? "inline" : false,
      minify: !isDevelopment,
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
      },
    },
    server: {
      host: process.env.HOST ?? "0.0.0.0",
      port: Number(process.env.PORT ?? 8443),
      strictPort: true,
      proxy: {
        "/api": process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3000",
      },
    },
    preview: {
      host: process.env.HOST ?? "0.0.0.0",
      port: Number(process.env.PREVIEW_PORT ?? 4173),
    },
  };
});
