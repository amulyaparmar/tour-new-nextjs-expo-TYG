const { execFileSync } = require("node:child_process");

let patchPackageCli;
try {
  patchPackageCli = require.resolve("patch-package/index.js");
} catch {
  console.log("patch-package is not installed; skipping mobile-only patches.");
  process.exit(0);
}

execFileSync(process.execPath, [patchPackageCli], { stdio: "inherit" });
