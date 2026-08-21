import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// يطابق alias المسارات في tsconfig ("@/*" → جذر المشروع) حتى تعمل
// الاختبارات مع وحدات تستورد الـ seed عبر "@/data/...".
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
