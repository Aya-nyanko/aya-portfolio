"use strict";

(() => {
  // Keep transport independent of DOM so it can be tested without sending mail.
  function getEndpoint(config) {
    if (!config || config.privacyPolicyApproved !== true || typeof config.endpoint !== "string") return "";
    try {
      const url = new URL(config.endpoint);
      return url.protocol === "https:" && url.hostname === "formspree.io" && !url.port &&
        !url.username && !url.password && !url.search && !url.hash && /^\/f\/[a-zA-Z0-9]+$/.test(url.pathname) ? url.href : "";
    } catch { return ""; }
  }

  async function sendContact(config, values, { fetchImpl = fetch, timeoutMs = 20000 } = {}) {
    const endpoint = getEndpoint(config);
    if (!endpoint) throw new Error("not-configured");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ name: values.name, email: values.email, company: values.company,
          category: values.category, message: values.message, consent: "同意済み" }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error("send-failed");
      return true;
    } finally { clearTimeout(timeout); }
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
  const fields = Object.fromEntries(["name", "email", "company", "category", "message", "consent"]
    .map(key => [key, document.getElementById(`contact-${key}`)]));
  const panels = Object.fromEntries(["input", "confirm", "success"]
    .map(key => [key, document.getElementById(`contact-${key}`)]));
  const send = document.getElementById("contact-send");
  const edit = document.getElementById("contact-edit");
  const review = document.getElementById("contact-review");
  const summary = document.getElementById("contact-error-summary");
  const sendError = document.getElementById("contact-send-error");
  const sendStatus = document.getElementById("contact-send-status");
  const policy = document.getElementById("privacy-policy");
  let state = "input";
  let confirmedValues = null;

  function showStep(next) {
    state = next;
    Object.entries(panels).forEach(([key, panel]) => { panel.hidden = key !== next; });
    document.querySelectorAll(".contact-steps [data-step]").forEach(item => {
      if (item.dataset.step === next) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
    const labels = { input: "STEP 01 入力画面", confirm: "STEP 02 確認画面", success: "STEP 03 送信完了" };
    document.getElementById("contact-step-status").textContent = labels[next];
    const title = document.getElementById(`contact-${next}-title`);
    title.focus({ preventScroll: true });
    document.querySelector(".contact-steps").scrollIntoView({ block: "start", behavior: "auto" });
  }

  function errorFor(key) {
    const field = fields[key];
    const value = field.value.trim();
    if (key === "consent") return field.checked ? "" : "プライバシーポリシーへの同意を確認してください。";
    if (key !== "company" && !value) {
      return ({ name: "お名前を入力してください。", email: "メールアドレスを入力してください。",
        category: "お問い合わせ種別を選択してください。", message: "お問い合わせ内容を入力してください。" })[key];
    }
    if (key === "email" && (field.validity.typeMismatch || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) return "メールアドレスを正しい形式で入力してください。";
    if (field.maxLength > 0 && value.length > field.maxLength) return `${field.maxLength}文字以内で入力してください。`;
    return "";
  }

  function setError(key, message) {
    document.getElementById(`error-${key}`).textContent = message;
    if (message) fields[key].setAttribute("aria-invalid", "true");
    else fields[key].removeAttribute("aria-invalid");
  }

  Object.entries(fields).forEach(([key, field]) => {
    field.addEventListener("input", () => {
      if (field.getAttribute("aria-invalid") === "true") setError(key, errorFor(key));
      const remaining = Object.values(fields).filter(input => input.getAttribute("aria-invalid") === "true").length;
      summary.textContent = remaining ? `${remaining}項目をご確認ください。各入力欄の下に修正内容を表示しています。` : "";
    });
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    if (state !== "input") return;
    const invalid = [];
    Object.keys(fields).forEach(key => {
      const message = errorFor(key);
      setError(key, message);
      if (message) invalid.push(key);
    });
    if (invalid.length) {
      summary.textContent = `${invalid.length}項目をご確認ください。各入力欄の下に修正内容を表示しています。`;
      fields[invalid[0]].focus();
      return;
    }
    summary.textContent = "";
    confirmedValues = Object.freeze(Object.fromEntries(["name", "email", "company", "category", "message"]
      .map(key => [key, fields[key].value.trim()])));
    document.querySelectorAll("[data-review]").forEach(node => {
      node.textContent = confirmedValues[node.dataset.review] || "入力なし";
    });
    sendError.textContent = "";
    sendStatus.textContent = "";
    send.disabled = !ready;
    showStep("confirm");
  });

  edit.addEventListener("click", () => {
    if (state !== "confirm") return;
    confirmedValues = null;
    showStep("input");
  });

  send.addEventListener("click", async () => {
    if (!ready || state !== "confirm" || !confirmedValues) return;
    state = "sending";
    send.disabled = true;
    edit.disabled = true;
    panels.confirm.setAttribute("aria-busy", "true");
    sendError.textContent = "";
    sendStatus.textContent = "送信しています。そのままお待ちください。";
    try {
      await sendContact(config, confirmedValues);
      // Only a successful HTTP response reaches this step.
      sendStatus.textContent = "";
      showStep("success");
      form.reset();
      confirmedValues = null;
    } catch (error) {
      state = "confirm";
      sendStatus.textContent = "";
      sendError.textContent = error.name === "AbortError"
        ? "送信結果を確認できませんでした。通信状況を確認して、時間をおいてからお試しください。入力内容は保持されています。"
        : "送信できませんでした。通信状況をご確認のうえ、もう一度お試しください。入力内容は保持されています。";
      sendError.focus({ preventScroll: true });
      sendError.scrollIntoView({ block: "nearest", behavior: "auto" });
    } finally {
      panels.confirm.removeAttribute("aria-busy");
      edit.disabled = false;
      send.disabled = !ready || state === "success";
    }
  });

  document.getElementById("privacy-link").addEventListener("click", () => { policy.open = true; });
  document.getElementById("privacy-return").addEventListener("click", event => {
    event.preventDefault();
    fields.consent.focus();
  });
  if (location.hash === "#privacy-policy") policy.open = true;
  if (ready) {
    document.getElementById("contact-availability").hidden = true;
    document.getElementById("contact-send-note").textContent = "内容をご確認のうえ、「送信する」を押してください。";
  }
  review.disabled = false;
})();
