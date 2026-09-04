import fs from "node:fs";
import path from "node:path";

const REGISTRY_BASE = "https://ui.bklit.com/r";
const visited = new Set();
const allDependencies = new Set();
const allFiles = new Map();

async function fetchComponent(name) {
  const cleanName = name.replace(/^@bklit\//, "");
  if (visited.has(cleanName)) return;
  visited.add(cleanName);

  const url = `${REGISTRY_BASE}/${cleanName}.json`;
  console.log(`Fetching ${url}...`);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Failed to fetch ${url}: ${res.status}`);
    return;
  }
  const json = await res.json();

  if (json.dependencies) {
    for (const dep of json.dependencies) {
      allDependencies.add(dep);
    }
  }

  if (json.files) {
    for (const file of json.files) {
      // Use target or path
      const targetPath = file.target || file.path;
      if (!allFiles.has(targetPath)) {
        allFiles.set(targetPath, file.content);
      }
    }
  }

  if (json.registryDependencies) {
    for (const regDep of json.registryDependencies) {
      await fetchComponent(regDep);
    }
  }
}

async function main() {
  const targets = ["area-chart", "line-chart", "bar-chart", "composed-chart", "shimmering-text"];
  for (const t of targets) {
    await fetchComponent(t);
  }

  console.log(`Total components visited: ${visited.size}`);
  console.log(`Dependencies to install:`, Array.from(allDependencies));
  console.log(`Files to create: ${allFiles.size}`);

  for (const [relPath, content] of allFiles.entries()) {
    // Normalise path: if target starts with components/, write to src/components/
    let dest = relPath;
    if (dest.startsWith("components/")) {
      dest = "src/" + dest;
    } else if (!dest.startsWith("src/")) {
      dest = "src/components/" + dest;
    }
    const fullPath = path.resolve(process.cwd(), dest);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf8");
    console.log(`Wrote ${dest}`);
  }

  fs.writeFileSync("scripts/bklit-deps.json", JSON.stringify(Array.from(allDependencies), null, 2));
}

main().catch(console.error);
