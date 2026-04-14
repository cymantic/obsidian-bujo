import esbuild from "esbuild";

// Build Parser.ts as a standalone ESM module for testing
await esbuild.build({
  entryPoints: ["src/Parser.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/Parser.js",
  external: [],
});

console.log("✓ Parser.js built for testing");
