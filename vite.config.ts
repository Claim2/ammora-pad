import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the built dist also renders from file://
  // (handy for local screenshots; static hosts serve it identically).
  base: "./",
  server: {
    port: 5173,
  },
});
