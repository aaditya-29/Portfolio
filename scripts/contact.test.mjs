// Isolated UI state tests. Fake transport responses never send email and are not delivery verification.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(
  new URL("../assets/js/mail.js", import.meta.url),
  "utf8",
);

class Element {
  constructor() {
    this.attributes = new Map();
    this.listeners = new Map();
    this.children = [];
    this._text = "";
    this.hidden = false;
    this.value = "";
    this.disabled = false;
    this.bounds = { top: 0, bottom: 0 };
    this.scrolls = [];
  }
  set textContent(value) {
    this._text = value;
    this.children = [];
  }
  get textContent() {
    return (
      this._text +
      this.children
        .map((child) => (typeof child === "string" ? child : child.textContent))
        .join("")
    );
  }
  setAttribute(key, value) {
    this.attributes.set(key, String(value));
  }
  getAttribute(key) {
    return this.attributes.get(key) ?? null;
  }
  hasAttribute(key) {
    return this.attributes.has(key);
  }
  removeAttribute(key) {
    this.attributes.delete(key);
  }
  append(...children) {
    this.children.push(...children);
  }
  replaceChildren(...children) {
    this._text = "";
    this.children = children;
  }
  insertAdjacentElement(position, element) {
    assert.equal(position, "afterend");
    this.error = element;
  }
  addEventListener(type, handler) {
    this.listeners.set(type, [...(this.listeners.get(type) || []), handler]);
  }
  getBoundingClientRect() {
    return this.bounds;
  }
  scrollIntoView(options) {
    this.scrolls.push({ ...options });
  }
  async emit(type) {
    for (const handler of this.listeners.get(type) || [])
      await handler({ preventDefault() {} });
  }
}

function setup({
  fetch = async () => acceptedResponse(),
  config,
  offline = false,
} = {}) {
  const document = { activeElement: null, createElement: () => new Element() };
  const fields = [
    ["contact-name", "fullname", "text", 100],
    ["contact-email", "email", "email", 254],
    ["contact-message", "message", "textarea", 5000],
  ].map(([id, name, type, maxLength]) => {
    const field = Object.assign(new Element(), { id, name, type, maxLength });
    Object.defineProperty(field, "validity", {
      get: () => ({
        typeMismatch:
          type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value),
      }),
    });
    field.focus = () => {
      document.activeElement = field;
    };
    return field;
  });
  const form = new Element();
  const button = new Element();
  button.disabled = true;
  const label = new Element();
  const status = new Element();
  const errors = new Element();
  form.querySelector = (selector) =>
    selector === "[data-form-btn]"
      ? button
      : selector === "[data-form-btn-label]"
        ? label
        : null;
  form.querySelectorAll = () => fields;
  form.reset = () =>
    fields.forEach((field) => {
      field.value = "";
    });
  document.querySelector = (selector) =>
    ({
      "[data-form]": form,
      "[data-form-status]": status,
      "[data-form-errors]": errors,
    })[selector];
  const timers = new Map();
  const context = {
    document,
    window: { innerHeight: 800 },
    navigator: { onLine: !offline },
    fetch,
    AbortController,
    portfolioContactConfig:
      config === undefined
        ? {
            accessKey: "fixture-access",
          }
        : config,
    FormData: class {
      constructor() {
        this.values = Object.fromEntries(
          fields
            .filter((field) => !field.disabled)
            .map((field) => [field.name, field.value]),
        );
      }
      get(name) {
        return this.values[name] ?? null;
      }
    },
    setTimeout: (handler) => {
      const id = timers.size + 1;
      timers.set(id, handler);
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  runInNewContext(source, context);
  const fill = () => {
    fields[0].value = " Test Sender ";
    fields[1].value = "sender@example.org";
    fields[2].value = " An isolated UI test message. ";
  };
  return {
    form,
    button,
    label,
    status,
    errors,
    fields,
    document,
    timers,
    fill,
  };
}

function acceptedResponse() {
  return { status: 200, json: async () => ({ success: true }) };
}

test("initialization enables submit, associates persistent field errors, and uses custom validation", () => {
  const app = setup();
  assert.equal(app.button.disabled, false);
  assert.equal(app.form.noValidate, true);
  assert.equal(app.status.textContent, "");
  assert.equal(app.errors.textContent, "");
  app.fields.forEach((field) => {
    assert.equal(field.getAttribute("aria-describedby"), `${field.id}-error`);
    assert.equal(field.error.hidden, true);
  });
});

test("blank and whitespace-only input never reaches provider and focuses first invalid field", async () => {
  let requests = 0;
  const app = setup({
    fetch: async () => {
      requests++;
      return acceptedResponse();
    },
  });
  app.fields[0].value = "   ";
  await app.form.emit("submit");
  assert.equal(requests, 0);
  assert.equal(app.document.activeElement, app.fields[0]);
  assert.equal(app.fields[0].getAttribute("aria-invalid"), "true");
  assert.match(app.errors.textContent, /marked fields/);
});

test("invalid email stays client-side and clears its associated error after correction", async () => {
  let requests = 0;
  const app = setup({
    fetch: async () => {
      requests++;
      return acceptedResponse();
    },
  });
  app.fill();
  app.fields[1].value = "invalid-email";
  await app.form.emit("submit");
  assert.equal(requests, 0);
  assert.equal(app.document.activeElement, app.fields[1]);
  assert.match(app.fields[1].error.textContent, /valid email/);
  app.fields[1].value = "correct@example.org";
  await app.fields[1].emit("input");
  assert.equal(app.fields[1].hasAttribute("aria-invalid"), false);
});

test("overlength input is rejected before provider submission", async () => {
  const app = setup({
    fetch: async () => assert.fail("Invalid form must not send"),
  });
  app.fill();
  app.fields[2].value = "a".repeat(5001);
  await app.form.emit("submit");
  assert.match(app.fields[2].error.textContent, /5000 characters/);
});

test("accepted response sends the documented payload and resets the form only afterward", async () => {
  let request;
  const app = setup({
    fetch: async (...args) => {
      request = args;
      return acceptedResponse();
    },
  });
  app.fill();
  await app.form.emit("submit");
  assert.equal(request[0], "https://api.web3forms.com/submit");
  assert.equal(request[1].method, "POST");
  assert.equal(request[1].credentials, "omit");
  assert.equal(request[1].headers["Content-Type"], "application/json");
  assert.equal(request[1].headers.Accept, "application/json");
  assert.deepEqual(JSON.parse(request[1].body), {
    access_key: "fixture-access",
    name: "Test Sender",
    from_name: "Portfolio message from Test Sender",
    email: "sender@example.org",
    message: "An isolated UI test message.",
    subject: "Portfolio message from Test Sender",
  });
  assert(app.fields.every((field) => field.value === ""));
  assert.equal(
    app.status.textContent,
    "Message sent. Thanks for reaching out.",
  );
  assert.equal(app.errors.textContent, "");
  assert.equal(app.button.disabled, false);
  assert.equal(app.form.hasAttribute("aria-busy"), false);
});

test("pending submissions suppress duplicates and never show premature success", async () => {
  let resolveRequest;
  let requests = 0;
  const app = setup({
    fetch: () => {
      requests++;
      return new Promise((resolve) => {
        resolveRequest = resolve;
      });
    },
  });
  app.fill();
  const pending = app.form.emit("submit");
  assert.equal(app.button.disabled, true);
  assert.equal(app.form.getAttribute("aria-busy"), "true");
  assert.match(app.status.textContent, /Sending/);
  assert.equal(app.status.textContent, "Sending…");
  await app.form.emit("submit");
  assert.equal(requests, 1);
  resolveRequest(acceptedResponse());
  await pending;
  assert.equal(app.button.disabled, false);
});

test("HTTP 200 keeps the draft and loading state until JSON confirms acceptance", async () => {
  let resolveBody;
  let bodyStarted;
  let requests = 0;
  const readingBody = new Promise((resolve) => {
    bodyStarted = resolve;
  });
  const app = setup({
    fetch: async () => {
      requests++;
      return {
        status: 200,
        json: () => {
          bodyStarted();
          return new Promise((resolve) => {
            resolveBody = resolve;
          });
        },
      };
    },
  });
  app.fill();
  const pending = app.form.emit("submit");
  await readingBody;
  assert.equal(app.fields[2].value, "An isolated UI test message.");
  assert(app.fields.every((field) => field.disabled));
  assert.equal(app.button.disabled, true);
  assert.equal(app.form.getAttribute("aria-busy"), "true");
  assert.equal(app.status.textContent, "Sending…");
  await app.form.emit("submit");
  assert.equal(requests, 1);
  resolveBody({ success: true });
  await pending;
  assert(app.fields.every((field) => field.value === ""));
  assert.equal(app.button.disabled, false);
  assert.equal(
    app.status.textContent,
    "Message sent. Thanks for reaching out.",
  );
});

for (const code of [200, 500]) {
  test(`draft fields freeze during a pending HTTP ${code} request without losing the payload, then restore`, async () => {
    let resolveRequest;
    let request;
    const app = setup({
      fetch: (url, options) => {
        request = JSON.parse(options.body);
        return new Promise((resolve) => {
          resolveRequest = resolve;
        });
      },
    });
    app.fill();
    const pending = app.form.emit("submit");
    assert(app.fields.every((field) => field.disabled));
    assert.deepEqual(request, {
      access_key: "fixture-access",
      name: "Test Sender",
      from_name: "Portfolio message from Test Sender",
      email: "sender@example.org",
      message: "An isolated UI test message.",
      subject: "Portfolio message from Test Sender",
    });
    resolveRequest({
      status: code,
      json: async () => ({ success: code === 200 }),
    });
    await pending;
    assert(app.fields.every((field) => !field.disabled));
    assert.equal(
      app.fields[2].value,
      code === 200 ? "" : "An isolated UI test message.",
    );
  });
}

for (const code of [200, 500]) {
  test(`HTTP ${code} feedback scrolls into view only when needed, instantly and without changing focus`, async () => {
    const app = setup({
      fetch: async () => ({
        status: code,
        json: async () => ({ success: code === 200 }),
      }),
    });
    const panel = code === 200 ? app.status : app.errors;
    const otherPanel = code === 200 ? app.errors : app.status;
    panel.bounds = { top: 850, bottom: 950 };
    app.document.activeElement = app.button;
    app.fill();
    await app.form.emit("submit");
    assert.deepEqual(panel.scrolls, [
      { block: "nearest", behavior: "instant" },
    ]);
    assert.equal(otherPanel.scrolls.length, 0);
    assert.equal(app.document.activeElement, app.button);

    panel.bounds = { top: 650, bottom: 750 };
    panel.scrolls = [];
    app.fill();
    await app.form.emit("submit");
    assert.equal(panel.scrolls.length, 0);
    assert.equal(app.document.activeElement, app.button);
  });
}

for (const code of [400, 412, 429, 500, 202]) {
  test(`HTTP ${code} is not accepted even with a success payload, and preserves the draft`, async () => {
    let readResponseBody = false;
    const app = setup({
      fetch: async () => ({
        status: code,
        statusText: "Fixture provider rejection: private-detail",
        text: async () => {
          readResponseBody = true;
          return "Fixture provider rejection: private-detail";
        },
        json: async () => {
          readResponseBody = true;
          return { success: true };
        },
      }),
    });
    app.fill();
    await app.form.emit("submit");
    assert.equal(readResponseBody, false);
    assert.doesNotMatch(
      app.errors.textContent,
      /Web3Forms|private-detail|412|stack trace/i,
    );
    assert.equal(app.fields[2].value, "An isolated UI test message.");
    assert.equal(app.status.textContent, "");
    assert.match(
      app.errors.textContent,
      code === 429 ? /wait a moment/ : /Couldn't send your message/,
    );
    assert.match(app.errors.textContent, /aadireg29@gmail.com/);
    assert.equal(app.button.disabled, false);
  });
}

test("HTTP 200 with success false is rejected without exposing provider details", async () => {
  const app = setup({
    fetch: async () => ({
      status: 200,
      json: async () => ({
        success: false,
        message: "Fixture provider error: private-detail",
      }),
    }),
  });
  app.fill();
  await app.form.emit("submit");
  assert.match(app.errors.textContent, /Couldn't send your message/);
  assert.doesNotMatch(app.errors.textContent, /private-detail|provider/i);
  assert.equal(app.fields[2].value, "An isolated UI test message.");
  assert.equal(app.status.textContent, "");
  assert.match(app.errors.textContent, /aadireg29@gmail.com/);
  assert.equal(app.button.disabled, false);
  assert(app.fields.every((field) => !field.disabled));
});

for (const [description, result] of [
  ["missing success", {}],
  ["null success", { success: null }],
  ["string success", { success: "true" }],
  ["numeric success", { success: 1 }],
  ["null JSON", null],
  ["string JSON", "true"],
]) {
  test(`HTTP 200 with ${description} is unconfirmed and preserves the draft`, async () => {
    const app = setup({
      fetch: async () => ({ status: 200, json: async () => result }),
    });
    app.fill();
    await app.form.emit("submit");
    assert.match(
      app.errors.textContent,
      /couldn't confirm whether your message was sent/,
    );
    assert.equal(app.fields[2].value, "An isolated UI test message.");
    assert.equal(app.status.textContent, "");
    assert.match(app.errors.textContent, /aadireg29@gmail.com/);
    assert.equal(app.button.disabled, false);
    assert(app.fields.every((field) => !field.disabled));
    assert.equal(app.form.hasAttribute("aria-busy"), false);
    assert.equal(app.timers.size, 0);
  });
}

test("HTTP 200 with malformed JSON is unconfirmed without exposing parser details", async () => {
  const app = setup({
    fetch: async () => ({
      status: 200,
      json: async () => {
        throw new SyntaxError("Fixture stack trace: invalid provider JSON");
      },
    }),
  });
  app.fill();
  await app.form.emit("submit");
  assert.match(
    app.errors.textContent,
    /couldn't confirm whether your message was sent/,
  );
  assert.doesNotMatch(app.errors.textContent, /stack trace|provider JSON/);
  assert.equal(app.fields[2].value, "An isolated UI test message.");
  assert.equal(app.status.textContent, "");
  assert.equal(app.button.disabled, false);
  assert(app.fields.every((field) => !field.disabled));
  assert.equal(app.timers.size, 0);
});

test("network failure is reported as unconfirmed and retains the draft", async () => {
  const app = setup({
    fetch: async () => {
      throw new TypeError("fixture network error");
    },
  });
  app.fill();
  await app.form.emit("submit");
  assert.match(
    app.errors.textContent,
    /couldn't confirm whether your message was sent/,
  );
  assert.equal(app.fields[2].value, "An isolated UI test message.");
  assert.equal(app.status.textContent, "");
});

test("timeout abort reports ambiguous acceptance rather than a false failure or success", async () => {
  const app = setup({
    fetch: (url, options) =>
      new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () =>
          reject(
            Object.assign(new Error("fixture abort"), { name: "AbortError" }),
          ),
        );
      }),
  });
  app.fill();
  const pending = app.form.emit("submit");
  [...app.timers.values()][0]();
  await pending;
  assert.match(
    app.errors.textContent,
    /couldn't confirm whether your message was sent/,
  );
  assert.equal(app.fields[2].value, "An isolated UI test message.");
  assert.equal(app.button.disabled, false);
  assert.equal(app.timers.size, 0);
});

for (const scenario of [{ config: {} }, { offline: true }]) {
  test(`${scenario.offline ? "offline" : "missing configuration"} fails safely without a request`, async () => {
    const app = setup({
      ...scenario,
      fetch: async () => assert.fail("Unavailable integration must not send"),
    });
    app.fill();
    await app.form.emit("submit");
    assert.match(
      app.errors.textContent,
      scenario.offline ? /offline/ : /temporarily unavailable/,
    );
    assert.match(app.errors.textContent, /aadireg29@gmail.com/);
    assert.equal(app.fields[2].value, "An isolated UI test message.");
  });
}
