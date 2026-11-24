import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Two pages: index.html is the transparent pet overlay, manager.html is the PokePet window.
// Tauri loads the dev server on a fixed port and the built files from dist/.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: { input: { overlay: "index.html", manager: "manager.html" } },
  },
});
