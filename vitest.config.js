// =====================================================
// Vitest configuration
// =====================================================
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json"],
      include: [
        "js/db.js",
        "js/store.js",
        "js/offline-sync.js",
        "js/image-upload.js",
        "js/pin-rate-limit.js",
        "js/ui.js",
      ],
      exclude: [
        "js/views/**", // vistas requieren DOM completo + Supabase mock
        "js/supabase.js",
        "js/supabase-config.example.js",
        "js/components/**",
      ],
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 50,
        statements: 50,
      },
    },
  },
});
