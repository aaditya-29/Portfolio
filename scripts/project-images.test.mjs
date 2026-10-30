import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderProjectImages } from "./project-images.mjs";

const image = {
  src: "assets/images/real.png",
  alt: "A real project interface",
  caption: "Interface",
  width: 320,
  height: 699,
  layout: "phone",
};
const block = (id, previous = "stale media") =>
  `<!-- project-images:${id} -->${previous}<!-- /project-images:${id} -->`;
async function fixture(t, manifest) {
  const root = await mkdtemp(join(tmpdir(), "portfolio-project-images-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "assets/data"), { recursive: true });
  await mkdir(join(root, "assets/images"), { recursive: true });
  await writeFile(join(root, "assets/images/real.png"), "image fixture");
  if (manifest !== undefined)
    await writeFile(
      join(root, "assets/data/project-images.json"),
      JSON.stringify(manifest),
    );
  return root;
}

test("existing configured images render lazy, dimensioned figures using the existing gallery classes", async (t) => {
  const root = await fixture(t, { demo: [image] });
  const result = await renderProjectImages(block("demo"), root);
  assert.match(result, /data-project-media="demo"/);
  assert.match(result, /class="figures" data-project-gallery/);
  assert.match(result, /class="figure figure--phone" data-project-image/);
  assert.match(
    result,
    /width="320" height="699" loading="lazy" decoding="async"/,
  );
  assert(!result.includes("stale media"));
  assert(result.includes("<!-- project-images:demo -->"));
  assert(result.includes("<!-- /project-images:demo -->"));
});

test("wide architecture retains a meaningful original-image link without an empty gallery", async (t) => {
  const root = await fixture(t, {
    demo: [
      { ...image, layout: "wide", originalLabel: "Open original diagram" },
    ],
  });
  const result = await renderProjectImages(block("demo"), root);
  assert.match(
    result,
    /class="project-figure project-figure--detail" data-project-image/,
  );
  assert.match(
    result,
    /href="assets\/images\/real.png" target="_blank" rel="noopener noreferrer" aria-label="Open original diagram"/,
  );
  assert(!result.includes("data-project-gallery"));
});

test("missing, empty, and undefined project configuration leave only authoring markers", async (t) => {
  const root = await fixture(t, {
    empty: [],
    missing: [{ ...image, src: "assets/images/absent.png" }],
  });
  for (const id of ["empty", "missing", "undefined"]) {
    assert.equal(await renderProjectImages(block(id), root), block(id, "\n"));
  }
});

test("an absent manifest produces no image section or placeholder", async (t) => {
  const root = await fixture(t);
  assert.equal(
    await renderProjectImages(block("demo"), root),
    block("demo", "\n"),
  );
});

test("invalid asset paths and symlinks outside the image directory are never published", async (t) => {
  const entries = [
    "https://example.org/remote.png",
    "/tmp/private.png",
    "assets/images/../private.png",
    "assets/images/%2e%2e/private.png",
    "assets/images/real.png?file=private",
    "assets\\images\\real.png",
    "assets/images/outside.png",
  ].map((src) => ({ ...image, src }));
  const root = await fixture(t, { demo: entries });
  await writeFile(join(root, "outside.png"), "not a project image");
  await symlink(
    join(root, "outside.png"),
    join(root, "assets/images/outside.png"),
  );
  const result = await renderProjectImages(block("demo"), root);
  assert.equal(result, block("demo", "\n"));
});

test("an image directory redirected by symlink is not treated as published project assets", async (t) => {
  const root = await fixture(t, { demo: [image] });
  const alternate = join(root, "other-images");
  await mkdir(alternate);
  await writeFile(join(alternate, "real.png"), "outside the image tree");
  await rm(join(root, "assets/images"), { recursive: true });
  await symlink(alternate, join(root, "assets/images"));
  assert.equal(
    await renderProjectImages(block("demo"), root),
    block("demo", "\n"),
  );
});

test("missing alt text, unsupported layouts, and invalid dimensions are omitted", async (t) => {
  const entries = [
    { ...image, alt: " " },
    { ...image, width: 0 },
    { ...image, height: -1 },
    { ...image, width: 12.5 },
    { ...image, height: "699" },
    { ...image, layout: "card" },
  ];
  const root = await fixture(t, { demo: entries });
  assert.equal(
    await renderProjectImages(block("demo"), root),
    block("demo", "\n"),
  );
});

test("asset text and attributes are escaped while valid image dimensions are preserved", async (t) => {
  const root = await fixture(t, {
    demo: [
      {
        ...image,
        alt: 'A "quoted" <screen> & screenshot',
        caption: "<caption> & 'text'",
      },
    ],
  });
  const result = await renderProjectImages(block("demo"), root);
  assert(
    result.includes(
      'alt="A &quot;quoted&quot; &lt;screen&gt; &amp; screenshot"',
    ),
  );
  assert(result.includes("&lt;caption&gt; &amp; &#39;text&#39;"));
  assert(!result.includes("<caption>"));
});

test("rendering is idempotent and preserves surrounding content and unrelated blocks", async (t) => {
  const root = await fixture(t, { demo: [image] });
  const html = `<p>Project text</p>${block("demo")}<p>Repository link</p>`;
  const once = await renderProjectImages(html, root);
  assert.equal(await renderProjectImages(once, root), once);
  assert(once.startsWith("<p>Project text</p>"));
  assert(once.endsWith("<p>Repository link</p>"));
});

test("malformed configuration fails explicitly instead of reusing stale media", async (t) => {
  const root = await fixture(t, []);
  await assert.rejects(
    renderProjectImages(block("demo"), root),
    /keyed by project ID/,
  );
  await writeFile(join(root, "assets/data/project-images.json"), "not JSON");
  await assert.rejects(renderProjectImages(block("demo"), root), SyntaxError);
});

test("importing the renderer does not alter the repository source", async () => {
  const url = new URL("../index.html", import.meta.url);
  const before = await readFile(url, "utf8");
  await import("./project-images.mjs?read-only-import");
  assert.equal(await readFile(url, "utf8"), before);
});
