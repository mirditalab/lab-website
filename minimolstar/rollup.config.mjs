import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";
import { visualizer } from "rollup-plugin-visualizer";

const production = process.env.NODE_ENV === "production";
const analyze = process.env.ANALYZE === "true";

const basePlugins = (statsFile) =>
  [
    replace({
      preventAssignment: true,
      "process.env.NODE_ENV": JSON.stringify(production ? "production" : "development"),
    }),
    resolve({ browser: true, preferBuiltins: false }),
    commonjs(),
    analyze &&
      visualizer({
        filename: statsFile,
        title: "Mol* Bundle Analysis",
        open: false,
        gzipSize: true,
        brotliSize: true,
      }),
    production && terser(),
  ].filter(Boolean);

export default [
  {
    input: "molstar.js",
    output: {
      file: "../static/molstar.js",
      format: "es",
      sourcemap: true,
    },
    plugins: basePlugins("dist/stats.html"),
  },
];
