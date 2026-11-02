import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      input: ["index.html", "members/index.html"].map(file => fileURLToPath(new URL(file, import.meta.url)))
    }
  },
  server: { proxy: { "/api": "http://127.0.0.1:8787" } }
});
