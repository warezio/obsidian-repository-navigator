import esbuild from "esbuild";
import process from "process";

const prod = process.argv[2] === "production";

const commonOptions = {
  logLevel: "info",
  minify: prod,
};

Promise.all([
  esbuild.build({
    ...commonOptions,
    entryPoints: ["src/main.ts"],
    bundle: true,
    external: ["obsidian"],
    format: "cjs",
    target: "es2018",
    sourcemap: prod ? false : "inline",
    treeShaking: true,
    outfile: "main.js",
  }),
  esbuild.build({
    ...commonOptions,
    entryPoints: ["src/styles.css"],
    bundle: true,
    outfile: "styles.css",
  }),
]).catch(() => process.exit(1));
