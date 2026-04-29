import path from "node:path";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import VueI18nPlugin from "@intlify/unplugin-vue-i18n/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VueI18nPlugin({
      include: path.resolve(__dirname, "./src/locales/**")
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true
      },
      "/ws": {
        target: "ws://localhost:8787",
        ws: true
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          // Keep markdown libraries out of app chunks so Vue runtime never imports through async views.
          if (/[\\/]node_modules[\\/](marked|marked-highlight|highlight\.js)[\\/]/.test(id)) {
            return "vendor-markdown";
          }
          if (/[\\/]node_modules[\\/](@vue|vue)[\\/]/.test(id)) {
            return "vendor-vue";
          }
          return undefined;
        }
      }
    }
  }
});
