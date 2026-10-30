import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { renderProjectImages } from "./project-images.mjs";
import "../assets/js/contact-config.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "dist");
const env = {};

// The optional local .env is build input only and is never copied to the site.
try {
  const source = await readFile(resolve(root, ".env"), "utf8");
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(WEB3FORMS_ACCESS_KEY)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const defaults = globalThis.portfolioContactConfig;
const value = (key, fallback) =>
  (process.env[key] ?? env[key] ?? fallback).trim();
const config = {
  accessKey: value("WEB3FORMS_ACCESS_KEY", defaults.accessKey),
};
const configured = Boolean(config.accessKey);

const html = await renderProjectImages(
  await readFile(resolve(root, "index.html"), "utf8"),
  root,
);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const path of ["assets", "robots.txt", "sitemap.xml"]) {
  await cp(resolve(root, path), resolve(output, path), { recursive: true });
}
await writeFile(resolve(output, "index.html"), html);
await writeFile(
  resolve(output, "assets/js/contact-config.js"),
  `// Generated public Web3Forms configuration. Never put a private key here.\nglobalThis.portfolioContactConfig = Object.freeze(${JSON.stringify(config, null, 2)});\n`,
);
console.log(
  `Built static site in dist/. Web3Forms: ${configured ? "public access key present; provider acceptance and mailbox delivery require verification" : "disabled; direct email remains available"}.`,
);
