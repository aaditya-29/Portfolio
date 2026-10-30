"use strict";

// Anchor navigation remains usable without JavaScript. Enhance it with a location cue.
const sectionLinks = [...document.querySelectorAll(".section-nav a")];
const trackedSections = sectionLinks
  .map((link) => document.querySelector(link.hash))
  .filter(Boolean);
let navigationFrame;
function updateLocationCue() {
  navigationFrame = undefined;
  const offset = window.innerWidth > 700 ? 100 : 60;
  // The final section can be too short to reach the usual top threshold.
  const atBottom =
    window.scrollY > 0 &&
    document.documentElement.scrollHeight -
      window.innerHeight -
      window.scrollY <=
      1;
  const current = atBottom
    ? trackedSections.at(-1)
    : trackedSections.findLast(
        (section) => section.getBoundingClientRect().top <= offset,
      );
  sectionLinks.forEach((link) => {
    if (current && link.hash === `#${current.id}`)
      link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
}
function scheduleLocationCue() {
  if (!navigationFrame)
    navigationFrame = requestAnimationFrame(updateLocationCue);
}
window.addEventListener("scroll", scheduleLocationCue, { passive: true });
window.addEventListener("resize", scheduleLocationCue);
scheduleLocationCue();

// Project notes are native disclosures: keyboard accessible and independent of JS.
function revealLinkedDetails() {
  let id;
  try {
    id = decodeURIComponent(window.location.hash.slice(1));
  } catch {
    return; // An incomplete percent escape is not a usable element ID.
  }
  const target = document.getElementById(id);
  if (target instanceof HTMLDetailsElement) target.open = true;
}
window.addEventListener("hashchange", revealLinkedDetails);
revealLinkedDetails();

// Optional project media is built from known assets; remove failed requests cleanly.
document.querySelectorAll("[data-project-image] img").forEach((image) => {
  function removeFailedImage() {
    const media = image.closest("[data-project-media]");
    image.closest("[data-project-image]")?.remove();
    media?.querySelectorAll("[data-project-gallery]").forEach((gallery) => {
      if (!gallery.querySelector("img")) gallery.remove();
    });
    if (media && !media.querySelector("img")) media.remove();
    else if (media) {
      media.querySelector("h4").textContent = media.querySelector(
        ".project-figure",
      )
        ? "Architecture and interface"
        : "Interface";
    }
  }
  image.addEventListener("error", removeFailedImage, { once: true });
  if (image.complete && image.naturalWidth === 0) removeFailedImage();
});

// Only certificates need a dialog. Native dialog handles focus trapping and Escape.
const viewer = document.getElementById("certificate-viewer");
if (viewer && typeof viewer.showModal === "function") {
  const viewerImg = viewer.querySelector("[data-viewer-img]");
  let opener;
  document.querySelectorAll("[data-certificate]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      opener = link;
      viewerImg.src = link.href;
      viewerImg.alt = `${link.querySelector(".certificate-title").textContent} certificate`;
      const thumbnail = link.querySelector("img");
      viewerImg.width = Number(thumbnail.getAttribute("width"));
      viewerImg.height = Number(thumbnail.getAttribute("height"));
      viewer.querySelector("[data-viewer-original]").href = link.href;
      viewer.querySelector("[data-viewer-title]").textContent =
        link.querySelector(".certificate-title").textContent;
      viewer.querySelector("[data-viewer-issuer]").textContent =
        link.querySelector(".cert-issuer").textContent;
      viewer.showModal();
      viewer.scrollTop = 0;
    });
  });
  viewer
    .querySelector("[data-modal-close]")
    .addEventListener("click", () => viewer.close());
  // Require both pointer-down and click outside the dialog to avoid closing after a drag.
  const outside = (event) => {
    const box = viewer.getBoundingClientRect();
    return (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    );
  };
  let startedOutside = false;
  viewer.addEventListener("pointerdown", (event) => {
    startedOutside = event.target === viewer && outside(event);
  });
  viewer.addEventListener("click", (event) => {
    if (startedOutside && event.target === viewer && outside(event))
      viewer.close();
    startedOutside = false;
  });
  viewer.addEventListener("close", () =>
    opener?.focus({ preventScroll: true }),
  );
}

document.querySelectorAll("[data-year]").forEach((element) => {
  element.textContent = new Date().getFullYear();
});
