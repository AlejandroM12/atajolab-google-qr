import { register } from "node:module";

register("./alias-loader.mjs", import.meta.url);

// Structured logs (lib/log.ts) stay quiet in unit tests unless LOG_TESTS=1.
if (process.env.LOG_TESTS !== "1") process.env.LOG_SILENT = "1";
