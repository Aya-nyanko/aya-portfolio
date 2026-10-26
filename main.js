"use strict";

// A classic deferred script keeps both file:// and a static server usable.
const menuButton = document.querySelector(".menu-toggle");
const nav = document.querySelector("#main-nav");
const smallScreen = window.matchMedia("(max-width: 760px)");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const main = document.querySelector("main");
const footer = document.querySelector("footer");

function setMenu(open, restoreFocus = false) {
  document.body.classList.toggle("menu-open", open);
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "メニューを閉じる" : "メニューを開く");
  nav.inert = smallScreen.matches && !open;
  main.inert = open;
  footer.inert = open;
  if (restoreFocus) menuButton.focus({ preventScroll: true });
}
menuButton.hidden = false;
document.body.classList.add("nav-enhanced");
setMenu(false);
menuButton.addEventListener("click", () => setMenu(menuButton.getAttribute("aria-expanded") !== "true"));
smallScreen.addEventListener("change", () => setMenu(false));
nav.addEventListener("click", event => {
  const link = event.target.closest("a");
  if (link && smallScreen.matches) {
    setMenu(false);
    const href = link.getAttribute("href");
    const section = href && href.startsWith("#") ? document.getElementById(href.slice(1)) : null;
    if (section) {
      // Move keyboard focus along with the in-page navigation.
      section.setAttribute("tabindex", "-1");
      section.focus({ preventScroll: true });
      section.addEventListener("blur", () => section.removeAttribute("tabindex"), { once: true });
    }
  } else if (event.target === nav && smallScreen.matches) {
    setMenu(false, true);
  }
});
document.addEventListener("keydown", event => {
  if (menuButton.getAttribute("aria-expanded") !== "true") return;
  if (event.key === "Escape") { setMenu(false, true); return; }
  if (event.key !== "Tab") return;
  const targets = [menuButton, ...nav.querySelectorAll("a")];
  const first = targets[0];
  const last = targets[targets.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Empty URLs produce no anchor. Only local paths or HTTP(S) URLs are accepted.
function safeUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value, document.baseURI);
    return ["http:", "https:", "file:"].includes(url.protocol) ? value : "";
  } catch { return ""; }
}

function makePlaceholder() {
  const frame = element("div", "placeholder");
  frame.setAttribute("role", "img");
  frame.setAttribute("aria-label", "作品画像は準備中です。デスクトップ・スマートフォンの画像を掲載予定。");
  const inner = element("div", "placeholder-inner");
  inner.setAttribute("aria-hidden", "true");
  inner.append(element("span", "placeholder-star", "✧"), element("span", "placeholder-label", "IMAGE COMING SOON"), element("span", "placeholder-note", "作品画像を準備中です"));
  const mobile = element("span", "placeholder-device", "MOBILE");
  mobile.setAttribute("aria-hidden", "true");
  frame.append(inner, mobile);
  return frame;
}

function makeImage(data, className, surface) {
  if (!data || !safeUrl(data.src)) return null;
  const img = element("img", className);
  img.src = data.src;
  img.alt = data.alt || "作品のスクリーンショット";
  img.loading = "lazy";
  img.decoding = "async";
  if (Number.isFinite(data.width) && data.width > 0) img.width = data.width;
  if (Number.isFinite(data.height) && data.height > 0) img.height = data.height;
  if (data.srcset) img.srcset = data.srcset;
  if (data.sizes) img.sizes = data.sizes;
  img.addEventListener("error", () => {
    img.remove();
    if (!surface.querySelector(".image-fallback")) surface.append(element("p", "image-fallback", "画像を表示できませんでした。画像パスをご確認ください。"));
  }, { once: true });
  return img;
}

function renderWorks() {
  const grid = document.querySelector("#works-grid");
  if (!grid) return; // Shared navigation also runs on the independent CONTACT page.
  const fragment = document.createDocumentFragment();
  (window.PORTFOLIO_WORKS || []).forEach((work, index) => {
    const card = element("article", "work-card");
    card.dataset.work = work.id;
    if (safeUrl(work.backgroundImage)) card.style.setProperty("--work-background", `url("${work.backgroundImage}")`);
    const inner = element("div", "work-inner reveal");
    const titleId = `work-title-${index}`;
    card.setAttribute("aria-labelledby", titleId);
    const surface = element("div", "work-image");
    const number = element("span", "work-number", String(index + 1).padStart(2, "0"));
    number.setAttribute("aria-hidden", "true");

    const desktop = makeImage(work.desktopImage, "screenshot-desktop", surface);
    const mobile = makeImage(work.mobileImage, desktop ? "screenshot-mobile" : "mobile-only-image", surface);
    const devices = element("div", "device-pair");
    if (desktop) {
      const frame = element("div", "device-desktop");
      const screen = element("div", "device-screen");
      screen.append(desktop);
      frame.append(screen);
      devices.append(frame);
    }
    if (mobile) {
      const frame = element("div", "device-phone");
      frame.append(mobile);
      devices.append(frame);
    }
    if (desktop || mobile) surface.append(devices);
    if (!desktop && !mobile) surface.append(makePlaceholder());
    const caption = element("div", "work-caption");
    const captionTop = element("div", "work-caption-top");
    const title = element("h3", "work-title", work.name);
    title.id = titleId;
    captionTop.append(title);
    caption.append(number, captionTop, element("p", "work-genre", work.genre), element("p", "work-description", work.description));
    const links = element("div", "work-links");
    const detailUrl = safeUrl(work.detailUrl);
    const siteUrl = safeUrl(work.siteUrl);
    if (detailUrl) {
      const detail = element("a", "", "VIEW DETAILS ↗");
      detail.href = detailUrl;
      detail.setAttribute("aria-label", `${work.name}の作品詳細`);
      links.append(detail);
    }
    if (siteUrl) {
      const site = element("a", "", "VIEW SITE →");
      site.href = siteUrl;
      site.target = "_blank";
      site.rel = "noopener noreferrer";
      site.setAttribute("aria-label", `${work.name}の公開サイト（新しいタブで開きます）`);
      links.append(site);
    }

    
    inner.append(caption, surface, links);
    card.append(inner);
    fragment.append(card);
  });
  grid.replaceChildren(fragment);
}
renderWorks();

// Content stays visible when JS or IntersectionObserver is unavailable.
if ("IntersectionObserver" in window && !reducedMotion.matches) {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.06, rootMargin: "0px 0px -16px 0px" });
  document.querySelectorAll(".reveal").forEach(node => {
    node.classList.add("reveal-ready");
    observer.observe(node);
  });
}
