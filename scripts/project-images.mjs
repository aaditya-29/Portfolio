import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const blockPattern =
  /<!--\s*project-images:([a-z0-9-]+)\s*-->[\s\S]*?<!--\s*\/project-images:\1\s*-->/g;
const layouts = new Set(["wide", "phone", "medium"]);
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );

async function validImage(image, root, imageRoot) {
  if (!image || typeof image !== "object" || !imageRoot) return false;
  if (typeof image.src !== "string" || !image.src.startsWith("assets/images/"))
    return false;
  if (/[\\%?#\u0000-\u001f\u007f]/.test(image.src)) return false;
  if (
    image.src.split("/").some((segment) => segment === "." || segment === "..")
  )
    return false;
  if (!/\.(?:png|jpe?g|webp|avif|gif|svg)$/i.test(image.src)) return false;
  if (typeof image.alt !== "string" || !image.alt.trim()) return false;
  if (
    !Number.isSafeInteger(image.width) ||
    image.width <= 0 ||
    !Number.isSafeInteger(image.height) ||
    image.height <= 0
  )
    return false;
  if (!layouts.has(image.layout)) return false;
  try {
    const file = await realpath(resolve(root, image.src));
    if (!file.startsWith(imageRoot + sep)) return false;
    const info = await stat(file);
    return info.isFile() && info.size > 0;
  } catch (error) {
    if (["ENOENT", "ENOTDIR", "ELOOP"].includes(error.code)) return false;
    throw error;
  }
}

function figure(image) {
  const src = escape(image.src);
  const img = `<img src="${src}" alt="${escape(image.alt)}" width="${image.width}" height="${image.height}" loading="lazy" decoding="async" />`;
  const caption =
    typeof image.caption === "string" && image.caption.trim()
      ? `<figcaption>${escape(image.caption)}${image.layout === "wide" ? ' <span aria-hidden="true">↗</span>' : ""}</figcaption>`
      : "";
  if (image.layout === "wide") {
    const label =
      typeof image.originalLabel === "string" && image.originalLabel.trim()
        ? image.originalLabel
        : `Open full-size image: ${image.alt}`;
    return `<figure class="project-figure project-figure--detail" data-project-image><a href="${src}" target="_blank" rel="noopener noreferrer" aria-label="${escape(label)}">${img}</a>${caption}</figure>`;
  }
  return `<figure class="figure figure--${image.layout}" data-project-image>${img}${caption}</figure>`;
}

/** Rebuild optional image blocks. Missing assets produce no media section or gallery. */
export async function renderProjectImages(html, root) {
  root = resolve(root);
  let manifest;
  try {
    manifest = JSON.parse(
      await readFile(resolve(root, "assets/data/project-images.json"), "utf8"),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    manifest = {};
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error(
      "Project image configuration must be an object keyed by project ID.",
    );
  }
  let imageRoot;
  const projectRoot = await realpath(root);
  try {
    imageRoot = await realpath(resolve(root, "assets/images"));
    if (imageRoot !== resolve(projectRoot, "assets/images"))
      imageRoot = undefined;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const blocks = [...html.matchAll(blockPattern)];
  const rendered = await Promise.all(
    blocks.map(async ([, id]) => {
      const configured =
        Object.hasOwn(manifest, id) && Array.isArray(manifest[id])
          ? manifest[id]
          : [];
      const available = await Promise.all(
        configured.map(async (image) =>
          (await validImage(image, root, imageRoot)) ? image : null,
        ),
      );
      const images = available.filter(Boolean);
      const wide = images.filter((image) => image.layout === "wide");
      const gallery = images.filter((image) => image.layout !== "wide");
      const content = images.length
        ? `<section class="detail-section" data-project-media="${escape(id)}"><h4>${wide.length ? "Architecture and interface" : "Interface"}</h4>${wide.map(figure).join("\n")}${gallery.length ? `<div class="figures" data-project-gallery>${gallery.map(figure).join("\n")}</div>` : ""}</section>`
        : "";
      return `<!-- project-images:${id} -->${content ? `\n${content}\n` : "\n"}<!-- /project-images:${id} -->`;
    }),
  );
  let index = 0;
  return html.replace(blockPattern, () => rendered[index++]);
}

// Importing this module never rewrites source. The authoring command is explicit.
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const path = resolve(root, "index.html");
  const source = await readFile(path, "utf8");
  await writeFile(path, await renderProjectImages(source, root));
  console.log("Updated optional project image blocks in index.html.");
}
