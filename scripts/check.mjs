import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const html = await readFile(resolve(root, "index.html"), "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "HTML IDs must be unique");
assert.equal(
  (html.match(/<h1(?:\s|>)/g) || []).length,
  1,
  "Use one primary heading",
);
assert.match(html, /<html\s+lang="en"/);
assert(
  !/EmailJS|Web3Forms|Personal portfolio|All fields are required/i.test(html),
  "Keep provider details and redundant captions out of visitor content",
);
assert(
  !html.includes("project-feature"),
  "Use a consistent overview layout for every project",
);
assert.match(
  html,
  /rel="canonical"\s+href="https:\/\/yadavaaditya\.com\.np\/"/,
);

for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
  const ref = match[1].replaceAll("&amp;", "&");
  if (/^(?:https?:|mailto:|data:)/.test(ref)) continue;
  if (ref.startsWith("#")) {
    assert(ids.includes(ref.slice(1)), `Missing anchor destination: ${ref}`);
  } else {
    await access(resolve(root, decodeURIComponent(ref.split(/[?#]/)[0])));
  }
}
for (const match of html.matchAll(
  /\b(?:aria-labelledby|aria-controls|aria-describedby)="([^"]+)"/g,
)) {
  for (const id of match[1].split(/\s+/))
    assert(ids.includes(id), `Missing ARIA target: ${id}`);
}
for (const match of html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)) {
  assert(ids.includes(match[1]), `Missing labelled field: ${match[1]}`);
}
for (const match of html.matchAll(
  /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
))
  JSON.parse(match[1]);

const projects = [
  "project-mindbridge",
  "project-kamiyapp",
  "project-ztma",
  "project-carcaddy",
  "project-delivery",
];
assert.deepEqual(
  [...html.matchAll(/<li class="project" id="([^"]+)"/g)].map(
    (match) => match[1],
  ),
  projects,
  "Keep projects in the requested order",
);
projects.forEach((id) =>
  assert(ids.includes(id), `Required project missing: ${id}`),
);
assert.equal(
  (html.match(/<li class="project\b/g) || []).length,
  5,
  "Retain exactly five projects",
);
assert(
  html.includes("https://github.com/aaditya-29/Car_Caddy_Batch1_Frontend"),
);
assert(html.includes("https://github.com/aaditya-29/Car_Caddy_Batch1_Backend"));
assert(
  html.includes(
    "https://github.com/aaditya-29/AI-Assisted-Digital-Behavioral-Screening-Mental-Health-Support-Platform",
  ),
);
assert(html.includes("mailto:aadireg29@gmail.com"));
assert.match(html, /Graduated May 2026[\s\S]*?CGPA 8\.8/);
assert.match(html, /<h3>Software Engineer<\/h3>/);
assert.match(html, /<h3>Software Intern<\/h3>/);
assert.match(html, /<h3>Java Fullstack Developer Intern<\/h3>/);
assert(
  html.indexOf("<h3>Software Engineer</h3>") <
    html.indexOf("<h3>Software Intern</h3>"),
);

async function filesIn(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const pathName = resolve(path, entry.name);
    if (entry.isDirectory()) files.push(...(await filesIn(pathName)));
    else files.push(pathName);
  }
  return files;
}
const publicFiles = [
  resolve(root, "index.html"),
  ...(await filesIn(resolve(root, "assets"))),
];
for (const file of publicFiles.filter((file) =>
  /\.(?:html|css|js|svg)$/.test(file),
)) {
  const source = await readFile(file, "utf8");
  assert(
    !source.includes("yadavaaditya" + "3029@gmail.com"),
    `Outdated public email: ${file}`,
  );
  assert(
    !/\b(?:window\.)?alert\s*\(/.test(source),
    `Browser alert call: ${file}`,
  );
  assert(
    !/href=["'](?:#|https?:\/\/example\.com)["']/.test(source),
    `Placeholder link: ${file}`,
  );
}
const scripts = (await filesIn(resolve(root, "scripts")))
  .concat(await filesIn(resolve(root, "assets/js")))
  .filter((file) => /\.(?:mjs|js)$/.test(file));
for (const file of scripts) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
    cwd: dirname(file),
  });
  assert.equal(result.status, 0, `${file}: ${result.stderr}`);
}
console.log(
  `Checks passed: ${ids.length} unique IDs, local references, ARIA targets, metadata, required content, and ${scripts.length} JavaScript syntax checks.`,
);
