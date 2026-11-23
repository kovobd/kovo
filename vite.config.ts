import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(({ isSsrBuild }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime", "react-router-dom", "@tanstack/react-query"],
  },
  // Server-side rendering bundle for the Cloudflare Worker (`npm run build:ssr`,
  // entry src/entry-server.tsx): every dependency bundled in, resolved the
  // way a Worker loads them, as one file with lazy imports inlined.
  ssr: {
    noExternal: true,
    target: "webworker",
    resolve: { conditions: ["worker", "browser"], externalConditions: ["worker", "browser"] },
  },
  // Stamped into the server bundle so cached server-rendered pages from an
  // earlier deploy are never served with this one (see worker/index.ts).
  define: isSsrBuild ? { __SSR_BUILD_ID__: JSON.stringify(Date.now().toString(36)) } : {},
  build: isSsrBuild ? {
    target: "es2022",
    copyPublicDir: false,
    minify: "esbuild",
    rollupOptions: {
      output: { format: "es", inlineDynamicImports: true, entryFileNames: "entry-server.js" },
    },
  } : {
    target: "es2020",
    cssMinify: true,
    minify: "esbuild",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          // Only group libraries that are TRUE entry-graph deps. Grouping
          // admin-only libs (recharts/d3-, react-easy-crop, @dnd-kit,
          // date-fns, lucide-react) into their own chunk causes Rollup's
          // shared CJS-interop helpers to be lifted into that chunk, which
          // then becomes a static dep of the public entry — a costly leak.
          // Let those admin libs colocate with the admin route chunks that
          // lazy-load them.
          //
          // Radix is NOT chunked here: only @radix-ui/react-slot is used
          // eagerly (via Button); the other 20+ primitives live behind
          // lazy routes. Grouping them all forced Rollup to preload ~85KB
          // gzip of unused Radix code on every homepage visit. Letting
          // Rollup decide colocates each primitive with the chunks that
          // actually import it.
          // tslib's tiny helpers (__rest, __assign…) are shared by Radix
          // (dialog / remove-scroll) and the Supabase SDK. Left alone, Rollup
          // put them inside the supabase chunk, so the Shop and product pages
          // downloaded the whole 220 KB SDK just to open a filter drawer.
          if (id.includes("/node_modules/tslib/")) return "tslib";
          // React in its own chunk: otherwise Rollup folds it into whichever
          // vendor chunk it meets first (it ended up inside "embla", so every
          // page shipped the hero carousel).
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react";
          if (id.includes("@tanstack")) return "query";
          if (id.includes("react-router")) return "router";
          if (id.includes("embla-carousel")) return "embla";
          if (id.includes("@supabase")) return "supabase";
        },

      },

    },
  },
}));
