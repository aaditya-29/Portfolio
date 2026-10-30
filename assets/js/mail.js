"use strict";

(() => {
  const form = document.querySelector("[data-form]");
  if (!form) return;

  const button = form.querySelector("[data-form-btn]");
  const buttonLabel = form.querySelector("[data-form-btn-label]");
  const status = document.querySelector("[data-form-status]");
  const errors = document.querySelector("[data-form-errors]");
  const config = globalThis.portfolioContactConfig;
  const contactEmail = "aadireg29@gmail.com";
  const fields = [
    ...form.querySelectorAll("input[required], textarea[required]"),
  ];
  let sending = false;

  if (!button || !buttonLabel || !status || !errors) return;
  // Use persistent, associated errors instead of browser validation bubbles.
  form.noValidate = true;
  button.disabled = false;

  const errorElements = new Map(
    fields.map((field) => {
      const error = document.createElement("span");
      error.id = `${field.id}-error`;
      error.className = "field-error";
      error.hidden = true;
      field.insertAdjacentElement("afterend", error);
      const describedBy = field.getAttribute("aria-describedby");
      field.setAttribute(
        "aria-describedby",
        [describedBy, error.id].filter(Boolean).join(" "),
      );
      return [field, error];
    }),
  );

  function setFieldError(field, message) {
    const error = errorElements.get(field);
    error.textContent = message;
    error.hidden = !message;
    if (message) field.setAttribute("aria-invalid", "true");
    else field.removeAttribute("aria-invalid");
  }

  function validateField(field) {
    if (!field.value.trim()) {
      return field.name === "message"
        ? "Please write a message."
        : field.type === "email"
          ? "Please enter your email address."
          : "Please enter your name.";
    }
    if (field.type === "email" && field.validity.typeMismatch)
      return "Please enter a valid email address.";
    if (field.maxLength > 0 && field.value.length > field.maxLength)
      return `Please use ${field.maxLength} characters or fewer.`;
    return "";
  }

  function revealFeedback(panel) {
    if (
      typeof window === "undefined" ||
      typeof panel.getBoundingClientRect !== "function" ||
      typeof panel.scrollIntoView !== "function"
    )
      return;
    const bounds = panel.getBoundingClientRect();
    if (bounds.top < 0 || bounds.bottom > window.innerHeight) {
      // Keep feedback visible without stealing focus or adding scroll animation.
      panel.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
  }

  function showError(message) {
    status.textContent = "";
    errors.replaceChildren();
    const text = document.createElement("p");
    text.textContent = message;
    const fallback = document.createElement("p");
    fallback.append("You can email me directly at ");
    const link = document.createElement("a");
    link.href = `mailto:${contactEmail}`;
    link.textContent = contactEmail;
    fallback.append(link, ".");
    errors.append(text, fallback);
    revealFeedback(errors);
  }

  fields.forEach((field) => {
    field.addEventListener("input", () => {
      if (field.hasAttribute("aria-invalid"))
        setFieldError(field, validateField(field));
    });
    field.addEventListener("blur", () => {
      if (field.value || field.hasAttribute("aria-invalid"))
        setFieldError(field, validateField(field));
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;
    status.textContent = "";
    errors.replaceChildren();

    fields.forEach((field) => {
      field.value = field.value.trim();
      setFieldError(field, validateField(field));
    });
    const firstInvalid = fields.find((field) =>
      field.hasAttribute("aria-invalid"),
    );
    if (firstInvalid) {
      errors.textContent =
        "Please check the marked fields before sending your message.";
      firstInvalid.focus();
      return;
    }

    const accessKey =
      typeof config?.accessKey === "string" ? config.accessKey.trim() : "";
    if (!accessKey) {
      showError("The form is temporarily unavailable.");
      return;
    }
    if (navigator.onLine === false) {
      showError(
        "You appear to be offline. Reconnect before sending your message.",
      );
      return;
    }

    // Disabled controls are omitted from FormData. Snapshot the validated draft first.
    const data = new FormData(form);
    const disabledStates = fields.map((field) => field.disabled);
    sending = true;
    fields.forEach((field) => {
      field.disabled = true;
    });
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    buttonLabel.textContent = "Sending…";
    form.setAttribute("aria-busy", "true");
    status.textContent = "Sending…";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "omit",
        signal: controller.signal,
        body: JSON.stringify({
          access_key: accessKey,
          name: data.get("fullname"),
          from_name: `Portfolio message from ${data.get("fullname")}`,
          email: data.get("email"),
          message: data.get("message"),
          subject: `Portfolio message from ${data.get("fullname")}`,
        }),
      });
      // Both the documented HTTP status and explicit JSON acceptance are required.
      if (response.status !== 200) {
        showError(
          response.status === 429
            ? "Please wait a moment before trying again."
            : "Couldn't send your message. Please try again.",
        );
        return;
      }
      const result = await response.json();
      if (result?.success === false) {
        showError("Couldn't send your message. Please try again.");
        return;
      }
      if (result?.success !== true)
        throw new Error("Unconfirmed delivery response");
      form.reset();
      fields.forEach((field) => setFieldError(field, ""));
      status.textContent = "Message sent. Thanks for reaching out.";
      revealFeedback(status);
    } catch {
      // A lost response does not establish whether the provider accepted the request.
      showError(
        "I couldn't confirm whether your message was sent. Your text has been kept. Please check before resending.",
      );
    } finally {
      clearTimeout(timeout);
      sending = false;
      fields.forEach((field, index) => {
        field.disabled = disabledStates[index];
      });
      button.disabled = false;
      button.removeAttribute("aria-busy");
      buttonLabel.textContent = "Send message";
      form.removeAttribute("aria-busy");
    }
  });
})();
