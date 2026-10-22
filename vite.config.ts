import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig(({ command, mode }) => {
  // Inject VITE_* variables as compile-time constants (works in both client and SSR builds).
  const loadedEnv = loadEnv(mode, process.cwd(), "VITE_");
  const envDefine = Object.fromEntries(
    Object.entries(loadedEnv).map(([key, value]) => [
      `import.meta.env.${key}`,
      JSON.stringify(value),
    ]),
  );

  return {
    define: envDefine,
    optimizeDeps: {
      // MapLibre resolves its web worker from `import.meta.url` at runtime.
      // Vite's dep pre-bundler rewrites that to the `node_modules/.vite/deps/`
      // directory, where `maplibre-gl-worker.mjs` does not exist, so the map
      // never finishes loading. Serving the package unbundled keeps the worker
      // URL correct in dev.
      exclude: ["maplibre-gl"],
    },
    resolve: {
      alias: {
        "@": `${process.cwd()}/src`,
      },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      // Cloudflare Workers target is only used for production builds.
      ...(command === "build" ? [cloudflare({ viteEnvironment: { name: "ssr" } })] : []),
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      // @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
      tanstackStart({
        importProtection: {
          behavior: "error",
          client: {
            files: ["**/server/**"],
            specifiers: ["server-only"],
          },
        },
        server: { entry: "server" },
      }),
      viteReact(),
    ],
    server: {
      host: "::",
      port: 8080,
      watch: {
        awaitWriteFinish: {
          stabilityThreshold: 1000,
          pollInterval: 100,
        },
      },
    },
  };
});
