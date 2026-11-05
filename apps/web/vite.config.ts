import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const api = process.env.LEVEX_API ?? "http://127.0.0.1:3000";

// Same-origin in dev: the page calls these paths, Vite forwards them to the API.
// Uploaded pictures come back as `/uploads/…`, so that prefix is on the list too.
const proxyPaths = ["/health", "/player", "/goals", "/artifacts", "/room", "/progress", "/spheres", "/uploads"];

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: Object.fromEntries(proxyPaths.map((path) => [path, { target: api, changeOrigin: true }])),
  },
});
