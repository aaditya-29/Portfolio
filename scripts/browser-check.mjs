import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";
import { chromium } from "playwright";

// UI fixtures intercept requests only in this test process. They do not test email delivery.
const root = resolve(fileURLToPath(new URL("../dist/", import.meta.url)));
const artifacts = resolve(
  process.env.QA_OUTPUT || process.argv[2] || "qa-artifacts",
);
await mkdir(artifacts, { recursive: true });
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".xml": "application/xml",
  ".txt": "text/plain",
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    const path = resolve(
      root,
      `.${pathname === "/" ? "/index.html" : pathname}`,
    );
    assert(path.startsWith(root + sep));
    assert((await stat(path)).isFile());
    response.writeHead(200, {
      "Content-Type": types[extname(path)] || "application/octet-stream",
    });
    response.end(await readFile(path));
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = (
  process.argv[3] || `http://127.0.0.1:${server.address().port}`
).replace(/\/$/, "");
let browser;
const results = [];
const passed = (name) => {
  results.push(name);
  console.log(`PASS ${name}`);
};
async function noOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert(
    metrics.scroll <= metrics.width,
    `${label}: horizontal overflow ${metrics.scroll} > ${metrics.width}`,
  );
}
async function loadImages(page) {
  for (const image of await page.locator("img").all()) {
    if (!(await image.isVisible())) continue;
    await image.scrollIntoViewIfNeeded();
    await image.evaluate((element) => element.decode());
  }
}
async function settleInteraction(target) {
  await target.evaluate(async (element) => {
    getComputedStyle(element).color;
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished),
    );
  });
}
try {
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  });
  for (const width of [320, 375, 390, 768, 1024, 1440, 1920]) {
    const page = await browser.newPage({
      viewport: { width, height: width < 700 ? 844 : 1000 },
      reducedMotion: "no-preference",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    assert.equal((await page.goto(base)).status(), 200);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
    assert.equal(await page.locator("h1").count(), 1);
    assert.equal(
      await page
        .locator(".experience-entry")
        .nth(0)
        .locator(".points li")
        .count(),
      2,
    );
    assert.equal(
      await page
        .locator(".experience-entry")
        .nth(1)
        .locator(".points li")
        .count(),
      2,
    );
    assert.equal(
      await page
        .locator(".experience-entry")
        .nth(2)
        .locator(".points li")
        .count(),
      3,
    );
    assert.equal(await page.locator(".projects > li").count(), 5);
    assert.deepEqual(
      await page
        .locator(".projects > .project")
        .evaluateAll((elements) => elements.map((element) => element.id)),
      [
        "project-mindbridge",
        "project-kamiyapp",
        "project-ztma",
        "project-carcaddy",
        "project-delivery",
      ],
    );
    assert.deepEqual(
      await page
        .locator(".project-meta time")
        .evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("datetime")),
        ),
      ["2026-05", "2025-04", "2025-03", "2025-01", "2024-05"],
    );
    assert.deepEqual(await page.locator(".project-num").allTextContents(), [
      "01",
      "02",
      "03",
      "04",
      "05",
    ]);
    assert.equal(await page.locator(".project-overview figure").count(), 0);
    assert.equal(
      await page.locator(".projects > .project > .project-details").count(),
      5,
    );
    assert.equal(await page.locator("[data-project-media]").count(), 2);
    assert.equal(await page.locator("[data-project-image]").count(), 5);
    for (const id of ["carcaddy", "delivery", "mindbridge"]) {
      assert.equal(
        await page.locator(`#${id} [data-project-media]`).count(),
        0,
      );
    }
    const visibleCopy = await page.locator("body").innerText();
    assert(
      !/EmailJS|Web3Forms|Personal portfolio|All fields are required/i.test(
        visibleCopy,
      ),
    );
    assert.equal(await page.locator(".topline .wordmark").innerText(), "AY.");
    assert.equal(
      await page
        .locator('.topline a[href="https://github.com/aaditya-29"]')
        .count(),
      1,
    );
    assert.equal(
      await page
        .locator('.topline a[href="https://www.linkedin.com/in/aaditya29/"]')
        .count(),
      1,
    );
    assert(await page.locator(".footer-note").isVisible());
    if (width === 390) {
      await page.keyboard.press("Tab");
      assert(
        await page
          .locator(".skip-link")
          .evaluate((element) => document.activeElement === element),
      );
      await page.keyboard.press("Enter");
      assert(
        await page
          .locator("#content")
          .evaluate((element) => document.activeElement === element),
      );
    }
    for (const section of await page.locator("main > section").all()) {
      await section.scrollIntoViewIfNeeded();
      await noOverflow(page, `${width}px section`);
    }
    if ([390, 1440].includes(width)) {
      const sectionGeometry = () =>
        page.locator("main > section").evaluateAll((elements) =>
          elements.map((element) => {
            const box = element.getBoundingClientRect();
            return [box.x, box.y + scrollY, box.width, box.height];
          }),
        );
      const before = await sectionGeometry();
      for (const selector of [
        ".social-links a",
        '.section-nav a[href="#skills"]',
        ".project-links .text-link",
        ".footer-links a",
      ]) {
        const link = page.locator(selector).first();
        await link.hover();
        await settleInteraction(link);
        const timing = await link.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            properties: style.transitionProperty.split(", "),
            durations: style.transitionDuration.split(", ").map(parseFloat),
          };
        });
        assert(timing.properties.includes("text-decoration-color"));
        assert(
          timing.durations.every(
            (seconds) => seconds >= 0.15 && seconds <= 0.2,
          ),
        );
      }
      const projectLink = page.locator(".project-links .text-link").first();
      await projectLink.hover();
      await settleInteraction(projectLink);
      assert.equal(
        await projectLink.evaluate((element) => {
          const style = getComputedStyle(element);
          return style.textDecorationColor === style.color;
        }),
        true,
      );
      const button = page.locator(".hero-actions .btn");
      const initialBackground = await button.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      );
      await button.hover();
      await settleInteraction(button);
      assert.notEqual(
        await button.evaluate(
          (element) => getComputedStyle(element).backgroundColor,
        ),
        initialBackground,
      );
      await page.keyboard.press("Tab");
      await button.focus();
      assert.equal(
        await button.evaluate(
          (element) => getComputedStyle(element).outlineWidth,
        ),
        "2px",
      );
      assert.equal(
        await button
          .locator('[aria-hidden="true"]')
          .evaluate((element) => getComputedStyle(element).transform),
        "none",
      );
      const field = page.locator("#contact-name");
      await field.focus();
      assert.equal(
        await field.evaluate(
          (element) => getComputedStyle(element).outlineWidth,
        ),
        "2px",
      );
      await settleInteraction(field);
      assert.equal(
        await field.evaluate((element) => {
          const style = getComputedStyle(element);
          return (
            style.transitionProperty === "border-color" &&
            style.borderTopColor === style.outlineColor
          );
        }),
        true,
      );
      await page.locator("#content").focus();
      assert.deepEqual(
        await sectionGeometry(),
        before,
        "Interaction states must not shift layout",
      );
    }
    for (const details of await page.locator(".project-details").all()) {
      const summary = details.locator("summary");
      await summary.focus();
      await page.keyboard.press("Enter");
      assert.equal(await details.getAttribute("open"), "");
      assert(await details.locator(".details-body").isVisible());
      if ([390, 1440].includes(width)) {
        await settleInteraction(summary);
        const marker = await summary.evaluate((element) => {
          const style = getComputedStyle(element, "::before");
          const rotation = new DOMMatrix(style.transform);
          return {
            angle: (Math.atan2(rotation.b, rotation.a) * 180) / Math.PI,
            duration: parseFloat(style.transitionDuration),
          };
        });
        assert.equal(marker.angle, 90);
        assert(marker.duration >= 0.15 && marker.duration <= 0.2);
        assert.equal(
          await details
            .locator(".details-body")
            .evaluate(
              (element) => element.getAnimations({ subtree: true }).length,
            ),
          0,
        );
      }
      await noOverflow(page, `${width}px expanded project`);
      for (const image of await details.locator("img").all()) {
        await image.scrollIntoViewIfNeeded();
        await image.evaluate((element) => element.decode());
      }
      if (
        (await details.getAttribute("id")) === "mindbridge" &&
        [390, 768, 1440].includes(width)
      ) {
        await page.locator("#content").focus();
        await page.locator("#project-mindbridge").screenshot({
          path: resolve(artifacts, `mindbridge-details-${width}.png`),
          style: ".section-nav { position: static !important; }",
        });
      }
      await summary.focus();
      await page.keyboard.press("Enter");
      assert.equal(await details.getAttribute("open"), null);
      if ([390, 1440].includes(width)) {
        await settleInteraction(summary);
        assert.equal(
          await summary.evaluate(
            (element) =>
              new DOMMatrix(getComputedStyle(element, "::before").transform).b,
          ),
          0,
        );
      }
    }
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.deepEqual(
      await page
        .locator(".section-nav [aria-current]")
        .evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("href")),
        ),
      ["#contact"],
      `${width}px: Contact must be current at the bottom of the page`,
    );
    await page.locator('.colophon a[href="#top"]').click();
    await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(await page.evaluate(() => scrollY), 0);
    assert.equal(await page.locator(".section-nav [aria-current]").count(), 0);
    await loadImages(page);
    await page.locator("#content").focus();
    await page.locator("#top").scrollIntoViewIfNeeded();
    if ([390, 768, 1440, 1920].includes(width)) {
      await page.screenshot({ path: resolve(artifacts, `hero-${width}.png`) });
    }
    for (const name of [
      "about",
      "skills",
      "experience",
      "projects",
      "education",
      "certificates",
      "contact",
    ]) {
      if (
        ![390, 768, 1440].includes(width) &&
        !(name === "contact" && width === 1024)
      )
        continue;
      await page.locator(`#${name}`).screenshot({
        path: resolve(artifacts, `${name}-${width}.png`),
        style: ".section-nav { position: static !important; }",
      });
    }
    if ([390, 768, 1440].includes(width)) {
      await page
        .locator(".colophon")
        .screenshot({ path: resolve(artifacts, `footer-${width}.png`) });
    }
    if (width === 390) {
      await loadImages(page);
      await page.screenshot({
        path: resolve(artifacts, "full-mobile.png"),
        fullPage: true,
      });
    }
    assert.deepEqual(errors, [], `${width}px browser errors`);
    await page.close();
    passed(
      `layout, interaction states, images, keyboard project details, location cue, and clean console at ${width}px`,
    );
  }

  const touch = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const touchPage = await touch.newPage();
  await touchPage.goto(base);
  assert.equal(
    await touchPage.evaluate(() => matchMedia("(hover: hover)").matches),
    false,
  );
  for (const details of await touchPage.locator(".project-details").all()) {
    await details.locator("summary").tap();
    assert(await details.locator(".details-body").isVisible());
    await noOverflow(touchPage, "touch project disclosure");
    await details.locator("summary").tap();
    assert.equal(await details.getAttribute("open"), null);
  }
  await touch.close();
  passed(
    "all five project disclosures work with touch and no hover capability",
  );

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const unexpectedPosts = [];
  // Keep every unhandled POST local to the test, even if provider routing regresses.
  await page.route("**/*", (route) => {
    if (route.request().method() === "POST") {
      unexpectedPosts.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  await page.goto(base);
  await page.locator('.section-nav a[href="#experience"]').click();
  assert.equal(new URL(page.url()).hash, "#experience");
  await page.waitForFunction(
    () =>
      document
        .querySelector('.section-nav a[href="#experience"]')
        .getAttribute("aria-current") === "location",
  );
  assert(
    await page.locator("#experience").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.top < innerHeight && rect.bottom > 0;
    }),
  );
  await page.locator('a[href="#project-carcaddy"]').click();
  assert.equal(new URL(page.url()).hash, "#project-carcaddy");
  await page.goBack();
  assert.equal(new URL(page.url()).hash, "#experience");
  const links = await page.locator(".project-links a").evaluateAll((elements) =>
    elements.map((element) => ({
      href: element.href,
      label: element.textContent.trim(),
      rel: element.rel,
    })),
  );
  assert.equal(links.length, 7);
  assert(
    links.some(
      (link) =>
        link.href ===
        "https://github.com/aaditya-29/AI-Assisted-Digital-Behavioral-Screening-Mental-Health-Support-Platform",
    ),
  );
  assert(
    links.some(
      (link) =>
        link.href === "https://mindbridge-f0zw.onrender.com/login" &&
        link.label.startsWith("Live site (sign-in)"),
    ),
  );
  assert(links.every((link) => link.rel.includes("noopener")));
  assert(
    links.some(
      (link) =>
        link.label.startsWith("Backend repository") &&
        link.href.endsWith("Car_Caddy_Batch1_Backend"),
    ),
  );
  assert(
    links.some(
      (link) =>
        link.label.startsWith("Frontend repository") &&
        link.href.endsWith("Car_Caddy_Batch1_Frontend"),
    ),
  );
  await page.goto(`${base}/#kamiyapp`);
  assert.equal(await page.locator("#kamiyapp").getAttribute("open"), "");
  passed(
    "anchor navigation, browser history, deep-linked details, six repository links, and configured MindBridge live link",
  );

  const cert = page.locator("[data-certificate]").first();
  const dialog = page.locator("#certificate-viewer");
  await cert.click();
  assert(await dialog.isVisible());
  assert(
    await page
      .locator("[data-modal-close]")
      .evaluate((element) => element === document.activeElement),
  );
  await page.keyboard.press("Tab");
  assert(
    await page
      .locator("[data-viewer-original]")
      .evaluate((element) => element === document.activeElement),
  );
  assert.equal(
    await page
      .locator("[data-viewer-original]")
      .evaluate((element) => element.href),
    await cert.evaluate((element) => element.href),
  );
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  assert(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  );
  await page.keyboard.press("Escape");
  assert(!(await dialog.isVisible()));
  assert(await cert.evaluate((element) => element === document.activeElement));
  await cert.click();
  await page.locator(".viewer-img").click();
  assert(await dialog.isVisible(), "Content clicks must keep dialog open");
  await page.mouse.click(2, 2);
  assert(!(await dialog.isVisible()), "Backdrop should close dialog");
  await page.setViewportSize({ width: 320, height: 568 });
  await cert.click();
  const rect = await dialog.boundingBox();
  assert(
    rect.x >= 0 &&
      rect.y >= 0 &&
      rect.x + rect.width <= 320 &&
      rect.y + rect.height <= 568,
  );
  await page.screenshot({ path: resolve(artifacts, "certificate-320.png") });
  await page.locator("[data-modal-close]").click();
  passed(
    "certificate focus, focus return, Escape, content/backdrop clicks, and 320px dialog bounds",
  );

  const malformedErrors = [];
  page.on("pageerror", (error) => malformedErrors.push(error.message));
  await page.goto(`${base}/#%`);
  await page.locator("[data-certificate]").first().click();
  assert(await dialog.isVisible());
  await page.keyboard.press("Escape");
  assert.deepEqual(malformedErrors, []);
  passed("malformed URL hash does not interrupt scripts");

  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const selector of [
    ".btn",
    ".text-link",
    ".social-links a",
    ".section-nav a",
    ".footer-links a",
    ".certificate-title",
    ".dialog-close",
    ".project-details summary",
    ".field input",
    ".field textarea",
  ]) {
    const duration = await page
      .locator(selector)
      .first()
      .evaluate((element) => getComputedStyle(element).transitionDuration);
    assert.equal(duration, "0s");
  }
  const reducedSummary = page.locator(".project-details summary").first();
  await reducedSummary.focus();
  await page.keyboard.press("Enter");
  assert(
    await page.locator(".project-details .details-body").first().isVisible(),
  );
  assert.equal(
    await reducedSummary.evaluate(
      (element) => getComputedStyle(element, "::before").transitionDuration,
    ),
    "0s",
  );
  assert.equal(
    await reducedSummary.evaluate(
      (element) => element.getAnimations({ subtree: true }).length,
    ),
    0,
  );
  await page.keyboard.press("Enter");
  passed(
    "reduced motion disables every transition while retaining immediate disclosure and focus behavior",
  );

  const submit = page.locator("[data-form-btn]");
  await submit.click();
  assert.equal(await page.locator('[aria-invalid="true"]').count(), 3);
  assert.equal(
    await page
      .locator("#contact-name")
      .evaluate((element) => document.activeElement === element),
    true,
  );
  await page.locator("#contact-name").fill("Portfolio UI test");
  await page.locator("#contact-email").fill("invalid");
  await page
    .locator("#contact-message")
    .fill("This request is intercepted by a local automated test.");
  await submit.click();
  assert.equal(
    await page.locator("#contact-email").getAttribute("aria-invalid"),
    "true",
  );
  await page.locator("#contact-email").fill("aadireg29@gmail.com");
  let calls = 0;
  let release;
  let requestStarted;
  const started = new Promise((done) => {
    requestStarted = done;
  });
  await page.route("https://api.web3forms.com/submit", async (route) => {
    calls++;
    requestStarted();
    await new Promise((done) => {
      release = done;
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  await submit.click();
  await started;
  await page.waitForFunction(
    () =>
      document.querySelector("[data-form]").getAttribute("aria-busy") ===
      "true",
  );
  await page.waitForFunction(() =>
    document
      .querySelector("[data-form-status]")
      .textContent.includes("Sending"),
  );
  assert(await submit.isDisabled());
  assert(await page.locator("#contact-name").isDisabled());
  assert(await page.locator("#contact-email").isDisabled());
  assert(await page.locator("#contact-message").isDisabled());
  assert(
    !(await page.locator("[data-form-status]").textContent()).includes(
      "Message sent.",
    ),
  );
  await page
    .locator("[data-form]")
    .evaluate((element) =>
      element.dispatchEvent(new Event("submit", { cancelable: true })),
    );
  assert.equal(calls, 1);
  await page
    .locator("#contact")
    .screenshot({ path: resolve(artifacts, "contact-loading-320.png") });
  release();
  await page.waitForFunction(() =>
    document
      .querySelector("[data-form-status]")
      .textContent.includes("Message sent."),
  );
  assert.equal(await page.locator("#contact-message").inputValue(), "");
  assert(await page.locator("#contact-message").isEnabled());
  await page
    .locator("#contact")
    .screenshot({ path: resolve(artifacts, "contact-success-320.png") });
  await page.unroute("https://api.web3forms.com/submit");
  await page.route("https://api.web3forms.com/submit", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        message: "Fixture private provider details",
      }),
    }),
  );
  await page.locator("#contact-name").fill("Portfolio UI test");
  await page.locator("#contact-email").fill("aadireg29@gmail.com");
  await page
    .locator("#contact-message")
    .fill("Preserve this message after a test-only provider rejection.");
  await submit.click();
  await page.waitForFunction(() =>
    document
      .querySelector("[data-form-errors]")
      .textContent.includes("Couldn't send"),
  );
  assert(
    (await page.locator("#contact-message").inputValue()).includes(
      "Preserve this message",
    ),
  );
  assert.equal(await page.locator("[data-form-status]").textContent(), "");
  assert(
    !/Web3Forms|Fixture private|access.key/i.test(
      await page.locator("[data-form-errors]").textContent(),
    ),
  );
  assert(await submit.isEnabled());
  assert(await page.locator("#contact-message").isEnabled());
  const errorBounds = await page
    .locator("[data-form-errors]")
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, viewport: innerHeight };
    });
  assert(
    errorBounds.top >= -1 && errorBounds.bottom <= errorBounds.viewport + 1,
    JSON.stringify(errorBounds),
  );
  await page
    .locator("#contact")
    .screenshot({ path: resolve(artifacts, "contact-failure-320.png") });
  await page.context().setOffline(true);
  await submit.click();
  assert(
    (await page.locator("[data-form-errors]").textContent()).includes(
      "offline",
    ),
  );
  await page.context().setOffline(false);
  assert.deepEqual(
    unexpectedPosts,
    [],
    "All automated form POSTs must be intercepted",
  );
  passed(
    "contact validation, loading, duplicate guard, confirmed acceptance, HTTP 200 JSON rejection, draft preservation, offline feedback (intercepted UI fixtures only)",
  );
  await page.close();

  const noJS = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 375, height: 844 },
  });
  const fallback = await noJS.newPage();
  await fallback.goto(base);
  assert.equal(await fallback.locator(".projects > li").count(), 5);
  await fallback.locator("#kamiyapp summary").click();
  assert.equal(await fallback.locator("#kamiyapp").getAttribute("open"), "");
  assert(await fallback.locator("[data-form-btn]").isDisabled());
  assert(await fallback.locator("noscript").isVisible());
  assert(
    (
      await fallback.locator("[data-certificate]").first().getAttribute("href")
    ).endsWith(".png"),
  );
  await noOverflow(fallback, "without JavaScript");
  await noJS.close();
  passed(
    "usable navigation/content/disclosures and direct-email fallback without JavaScript",
  );

  const failedMedia = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  const mediaScriptErrors = [];
  failedMedia.on("pageerror", (error) => mediaScriptErrors.push(error.message));
  await failedMedia.route("**/assets/images/kamiyapp-*.png", (route) =>
    route.abort(),
  );
  await failedMedia.goto(`${base}/#kamiyapp`);
  await failedMedia
    .locator("#kamiyapp [data-project-image] img")
    .evaluateAll((images) =>
      images.forEach((image) => {
        image.loading = "eager";
      }),
    );
  await failedMedia.waitForFunction(
    () => !document.querySelector('[data-project-media="kamiyapp"]'),
  );
  assert.equal(
    await failedMedia
      .locator(
        "#kamiyapp [data-project-image], #kamiyapp [data-project-gallery]",
      )
      .count(),
    0,
  );
  assert(await failedMedia.locator("#kamiyapp .points").isVisible());
  assert.equal(await failedMedia.locator(".projects > .project").count(), 5);
  await noOverflow(failedMedia, "all optional media failed");
  await failedMedia.locator("#project-kamiyapp").screenshot({
    path: resolve(artifacts, "images-unavailable-390.png"),
    style: ".section-nav { position: static !important; }",
  });
  assert.deepEqual(mediaScriptErrors, []);
  await failedMedia.close();
  passed(
    "failed optional image requests remove figures, galleries, and empty headings while preserving project details",
  );

  const partialMedia = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await partialMedia.route("**/assets/images/ztma-architecture.png", (route) =>
    route.abort(),
  );
  await partialMedia.goto(`${base}/#ztma`);
  await partialMedia
    .locator("#ztma [data-project-media] img")
    .evaluateAll((images) =>
      images.forEach((image) => {
        image.loading = "eager";
      }),
    );
  await partialMedia.waitForFunction(
    () =>
      document.querySelector('[data-project-media="ztma"] h4')?.textContent ===
      "Interface",
  );
  const remainingImage = partialMedia.locator("#ztma [data-project-image] img");
  assert.equal(await remainingImage.count(), 1);
  await remainingImage.evaluate((image) => image.decode());
  assert(
    await partialMedia.locator("#ztma [data-project-gallery]").isVisible(),
  );
  await noOverflow(partialMedia, "one optional image failed");
  await partialMedia.close();
  passed(
    "partial image failure retains the valid screenshot and updates the media heading",
  );

  await readFile(resolve(artifacts, "hero-1440.png"));
  console.log(
    `${results.length} browser check groups passed. Screenshots: ${artifacts}`,
  );
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
