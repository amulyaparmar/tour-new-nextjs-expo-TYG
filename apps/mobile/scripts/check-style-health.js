const fs = require("fs");
const path = require("path");

const appRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(appRoot, relativePath), "utf8");
}

function assertIncludes(file, source, needles) {
  for (const needle of needles) {
    if (!source.includes(needle)) {
      throw new Error(`${file} is missing required style wiring: ${needle}`);
    }
  }
}

function stripStringsAndComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/`(?:\\.|[^`])*`/g, "``")
    .replace(/"(?:\\.|[^"])*"/g, "\"\"")
    .replace(/'(?:\\.|[^'])*'/g, "''");
}

function findMatchingBrace(source, start) {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function topLevelStyleKeys(body) {
  const keys = [];
  let depth = 0;
  let segmentStart = 0;
  for (let index = 0; index <= body.length; index += 1) {
    const char = body[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if ((char === "," && depth === 0) || index === body.length) {
      const segment = body.slice(segmentStart, index).trim();
      const match = segment.match(/^([A-Za-z_$][\w$]*)\s*:/);
      if (match) keys.push(match[1]);
      segmentStart = index + 1;
    }
  }
  return keys;
}

function assertNoDuplicateStyleKeys(relativePath) {
  const source = stripStringsAndComments(read(relativePath));
  const marker = "StyleSheet.create({";
  let searchFrom = 0;
  while (true) {
    const markerIndex = source.indexOf(marker, searchFrom);
    if (markerIndex === -1) return;
    const start = source.indexOf("{", markerIndex);
    const end = findMatchingBrace(source, start);
    if (end === -1) {
      throw new Error(`${relativePath} has an unterminated StyleSheet.create block.`);
    }
    const keys = topLevelStyleKeys(source.slice(start + 1, end));
    const duplicates = [...new Set(keys.filter((key, index) => keys.indexOf(key) !== index))];
    if (duplicates.length > 0) {
      throw new Error(`${relativePath} has duplicate StyleSheet keys: ${duplicates.join(", ")}`);
    }
    searchFrom = end + 1;
  }
}

assertIncludes("index.js", read("index.js"), ["import \"./global.css\";"]);
assertIncludes("babel.config.js", read("babel.config.js"), ["jsxImportSource: \"nativewind\"", "\"nativewind/babel\""]);
assertIncludes("metro.config.js", read("metro.config.js"), ["withNativeWind", "input: \"./global.css\""]);
assertIncludes("tailwind.config.js", read("tailwind.config.js"), ["require(\"nativewind/preset\")", "./App.tsx", "./src/**/*.{ts,tsx}"]);

assertNoDuplicateStyleKeys("App.tsx");

console.log("Style health check passed.");
