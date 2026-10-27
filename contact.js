"use strict";

(() => {
  // Keep the transport independent of the DOM so it can be tested without sending mail.
  function getEndpoint(config) {
    if (
      !config ||
      config.privacyPolicyApproved !== true ||
      typeof config.endpoint !== "string"
    ) {
      return "";
    }

    try {
      const url = new URL(config.endpoint);
      const isValidEndpoint =
        url.protocol === "https:" &&
        url.hostname === "formspree.io" &&
        !url.port &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        /^\/f\/[a-zA-Z0-9]+$/.test(url.pathname);

      return isValidEndpoint ? url.href : "";
    } catch {
      return "";
    }
  }

  async function sendContact(
    config,
    values,
    { fetchImpl = fetch, timeoutMs = 20000 } = {}
  ) {
    const endpoint = getEndpoint(config);

    if (!endpoint) throw new Error("not-configured");
    if (typeof fetchImpl !== "function") {
      throw new Error("fetch-unavailable");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: values.name,
          email: values.email,
          company: values.company,
          category: values.category,
          message: values.message,
          consent: "同意済み"
        }),
        signal: controller.signal
      });

      if (!response || !response.ok) {
        throw new Error("send-failed");
      }

      return true;
    } finally {
      clearTimeout(timeout);
    }
  }

  // Node's built-in test runner can exercise the real transport with a fake fetch.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { getEndpoint, sendContact };
    return;
  }

  const form = document.getElementById("contact-form");
  if (!form) return;

  const config = window.CONTACT_CONFIG || {};
  const ready = Boolean(getEndpoint(config));

  const fields = Object.fromEntries(
    ["name", "email", "company", "category", "message", "consent"].map(
      key => [key, document.getElementById(`contact-${key}`)]
    )
  );

  const panels = Object.fromEntries(
    ["input", "confirm", "success"].map(
      key => [key, document.getElementById(`contact-${key}`)]
    )
  );

  const send = document.getElementById("contact-send");
  const edit = document.getElementById("contact-edit");
  const review = document.getElementById("contact-review");
  const summary = document.getElementById("contact-error-summary");
  const sendError = document.getElementById("contact-send-error");
  const sendStatus = document.getElementById("contact-send-status");
  const stepStatus = document.getElementById("contact-step-status");
  const steps = document.querySelector(".contact-steps");
  const policy = document.getElementById("privacy-policy");
  const privacyLink = document.getElementById("privacy-link");
  const privacyReturn = document.getElementById("privacy-return");
  const availability = document.getElementById("contact-availability");
  const sendNote = document.getElementById("contact-send-note");

  // Stop safely if the HTML does not contain the elements this script requires.
  if (
    Object.values(fields).some(field => !field) ||
    Object.values(panels).some(panel => !panel) ||
    !send ||
    !edit ||
    !review ||
    !summary ||
    !sendError ||
    !sendStatus ||
    !stepStatus ||
    !steps ||
    !policy ||
    !privacyLink ||
    !privacyReturn
  ) {
    console.error(
      "Contact form setup is incomplete. Check contact.html element IDs."
    );
    return;
  }

  let state = "input";
  let confirmedValues = null;

  function showStep(next) {
    state = next;

    Object.entries(panels).forEach(([key, panel]) => {
      panel.hidden = key !== next;
    });

    document.querySelectorAll(".contact-steps [data-step]").forEach(item => {
      if (item.dataset.step === next) {
        item.setAttribute("aria-current", "step");
      } else {
        item.removeAttribute("aria-current");
      }
    });

    const labels = {
      input: "STEP 01 入力画面",
      confirm: "STEP 02 確認画面",
      success: "STEP 03 送信完了"
    };

    stepStatus.textContent = labels[next];

    const title = document.getElementById(`contact-${next}-title`);

    if (title) {
      title.focus({ preventScroll: true });
    }

    steps.scrollIntoView({
      block: "start",
      behavior: "auto"
    });
  }

  function errorFor(key) {
    const field = fields[key];
    const value =
      typeof field.value === "string" ? field.value.trim() : "";

    if (key === "consent") {
      return field.checked
        ? ""
        : "プライバシーポリシーへの同意を確認してください。";
    }

    if (key !== "company" && !value) {
      return (
        {
          name: "お名前を入力してください。",
          email: "メールアドレスを入力してください。",
          category: "お問い合わせ種別を選択してください。",
          message: "お問い合わせ内容を入力してください。"
        }[key] || "入力内容をご確認ください。"
      );
    }

    if (
      key === "email" &&
      (
        field.validity.typeMismatch ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      )
    ) {
      return "メールアドレスを正しい形式で入力してください。";
    }

    if (field.maxLength > 0 && value.length > field.maxLength) {
      return `${field.maxLength}文字以内で入力してください。`;
    }

    return "";
  }

  function setError(key, message) {
    const errorElement = document.getElementById(`error-${key}`);

    if (errorElement) {
      errorElement.textContent = message;
    }

    if (message) {
      fields[key].setAttribute("aria-invalid", "true");
    } else {
      fields[key].removeAttribute("aria-invalid");
    }
  }

  function updateErrorSummary() {
    const remaining = Object.values(fields).filter(
      field => field.getAttribute("aria-invalid") === "true"
    ).length;

    summary.textContent = remaining
      ? `${remaining}項目をご確認ください。各入力欄の下に修正内容を表示しています。`
      : "";
  }

  // Update validation messages as the user edits fields.
  Object.entries(fields).forEach(([key, field]) => {
    ["input", "change"].forEach(eventName => {
      field.addEventListener(eventName, () => {
        if (field.getAttribute("aria-invalid") === "true") {
          setError(key, errorFor(key));
        }

        updateErrorSummary();
      });
    });
  });

  // Validate the form and move to the confirmation screen.
  form.addEventListener("submit", event => {
    event.preventDefault();

    if (state !== "input") return;

    const invalid = [];

    Object.keys(fields).forEach(key => {
      const message = errorFor(key);

      setError(key, message);

      if (message) {
        invalid.push(key);
      }
    });

    if (invalid.length) {
      updateErrorSummary();
      fields[invalid[0]].focus();
      return;
    }

    summary.textContent = "";

    confirmedValues = Object.freeze(
      Object.fromEntries(
        ["name", "email", "company", "category", "message"].map(key => [
          key,
          fields[key].value.trim()
        ])
      )
    );

    document.querySelectorAll("[data-review]").forEach(node => {
      node.textContent =
        confirmedValues[node.dataset.review] || "入力なし";
    });

    sendError.textContent = "";
    sendStatus.textContent = "";
    send.disabled = !ready;

    showStep("confirm");
  });

  // Return to the input screen for corrections.
  edit.addEventListener("click", () => {
    if (state !== "confirm") return;

    confirmedValues = null;
    showStep("input");
  });

  // Submit the confirmed data to Formspree.
  send.addEventListener("click", async () => {
    if (!ready || state !== "confirm" || !confirmedValues) return;

    state = "sending";
    send.disabled = true;
    edit.disabled = true;

    panels.confirm.setAttribute("aria-busy", "true");
    sendError.textContent = "";
    sendStatus.textContent =
      "送信しています。そのままお待ちください。";

    try {
      await sendContact(config, confirmedValues);

      // Only a successful HTTP response reaches this step.
      sendStatus.textContent = "";
      showStep("success");

      form.reset();
      confirmedValues = null;

      Object.keys(fields).forEach(key => {
        setError(key, "");
      });

      summary.textContent = "";
    } catch (error) {
      state = "confirm";
      sendStatus.textContent = "";

      sendError.textContent =
        error && error.name === "AbortError"
          ? "送信結果を確認できませんでした。通信状況を確認して、時間をおいてからお試しください。入力内容は保持されています。"
          : "送信できませんでした。通信状況をご確認のうえ、もう一度お試しください。入力内容は保持されています。";

      sendError.focus({ preventScroll: true });
      sendError.scrollIntoView({
        block: "nearest",
        behavior: "auto"
      });
    } finally {
      panels.confirm.removeAttribute("aria-busy");
      edit.disabled = false;
      send.disabled = !ready || state === "success";
    }
  });

  // Open the privacy policy when its link is selected.
  privacyLink.addEventListener("click", () => {
    policy.open = true;
  });

  privacyReturn.addEventListener("click", event => {
    event.preventDefault();
    fields.consent.focus();
  });

  if (location.hash === "#privacy-policy") {
    policy.open = true;
  }

  if (ready) {
    if (availability) {
      availability.hidden = true;
    }

    if (sendNote) {
      sendNote.textContent =
        "内容をご確認のうえ、「送信する」を押してください。";
    }
  }

  review.disabled = false;
})();
