import { defineConfig } from "vite";

// For the wifi fallback only (see Session 2, Part D):
//   1. npm install -D @vitejs/plugin-basic-ssl
//   2. uncomment the import line below and the plugins line
// import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
  // plugins: [basicSsl()],

  server: {
    port: 5173,

    // Refuse to start rather than quietly moving to 5174, 5175, 5176...
    // `adb reverse` forwards port 5173 specifically, so a silent move means
    // the headset gets a 404 and you spend an hour wondering why.
    // If this errors with "port is already in use", run:  pkill -f vite
    strictPort: true,

    // Listen on all network interfaces. Not needed for the USB route, but it
    // costs nothing and the wifi fallback depends on it.
    host: true,
  },

  preview: {
    port: 4173,
    strictPort: true,
    host: true,
  },

  build: {
    target: "es2020",
    // Lets you trace an error in the built version back to your source file.
    sourcemap: true,
  },
});
