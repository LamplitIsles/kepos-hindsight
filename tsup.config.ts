import { defineConfig } from "tsup";

const dshExternals = [
  "@deepseek-ai/cordis",
  "@deepseek-ai/dsh-api-remotes",
  "@deepseek-ai/dsh-client-connection",
  "@deepseek-ai/dsh-client-locale",
  "@deepseek-ai/dsh-client-runtime",
  "@deepseek-ai/dsh-client-ui-settings",
  "@deepseek-ai/dsh-client-ui-settings-plugins",
  "@deepseek-ai/dsh-client-ui-slots",
  "@deepseek-ai/dsh-settings",
  "@deepseek-ai/schemastery"
];

export default defineConfig([
  {
    entry: { index: "src/index.ts", dsh: "src/dsh.ts" },
    format: ["esm"],
    platform: "node",
    target: "node20",
    dts: true,
    clean: true,
    external: [...dshExternals, "react"]
  },
  {
    entry: { client: "src/client.ts" },
    format: ["cjs"],
    platform: "browser",
    target: "es2022",
    dts: true,
    clean: false,
    loader: { ".css": "text" },
    external: ["react", ...dshExternals],
    outExtension: () => ({ js: ".js" }),
    banner: {
      js: 'window.__ModuleLoader__.load({ id: "@lamplitisles/kepos-hindsight", factory: (require) => { var module = { exports: {} }; var exports = module.exports;'
    },
    footer: { js: "return module.exports; } });" }
  }
]);
