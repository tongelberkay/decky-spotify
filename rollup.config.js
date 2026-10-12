import deckyPlugin from "@decky/rollup";

const config = deckyPlugin({});
config.output.entryFileNames = "index.js";
if (process.env.FRONTEND_ONLY === "true") config.input = "./src/demo.tsx";
export default config;
