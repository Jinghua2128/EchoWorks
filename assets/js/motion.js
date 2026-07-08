(function () {
  "use strict";

  const motionEnabled = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const interactiveSelector = [
    ".button",
    ".nav-button",
    ".tool-card",
    ".unit-row",
    ".rating-option",
    ".back-button",
    ".icon-button",
    ".text-button",
    ".choice-button",
    ".role-card",
    ".filter-button",
    ".admin-list-item"
  ].join(",");

  const entranceSelector = [
    ".auth-card",
    ".auth-copy",
    ".page-header > *",
    ".panel",
    ".unit-row",
    ".tool-card",
    ".scenario-card",
    ".learner-stats span",
    ".role-card",
    ".choice-button",
    ".dialogue-panel",
    ".progress-panel",
    ".reflection-panel > *",
    ".admin-metric",
    ".chart-card",
    "tbody tr",
    ".detail-card",
    ".reflection-item",
    ".admin-list-item"
  ].join(",");

  const animated = new WeakSet();
  const bound = new WeakSet();

  function gsapReady() {
    return motionEnabled && window.gsap;
  }

  function injectStyles() {
    if (document.getElementById("motionStyles")) return;
    const style = document.createElement("style");
    style.id = "motionStyles";
    style.textContent = `
      [data-motion-bound="true"] { will-change: transform; }
      .motion-ripple {
        position: absolute;
        z-index: 0;
        width: 18px;
        height: 18px;
        border-radius: 999px;
        background: rgba(215, 25, 32, .18);
        pointer-events: none;
        transform: translate(-50%, -50%) scale(0);
      }
      .button, .nav-button, .tool-card, .unit-row, .rating-option, .back-button,
      .icon-button, .text-button, .choice-button, .role-card, .filter-button {
        transform-origin: center;
      }
    `;
    document.head.append(style);
  }

  function isDisabled(element) {
    return element.matches(":disabled") || element.getAttribute("aria-disabled") === "true";
  }

  function press(element) {
    if (!gsapReady() || isDisabled(element)) return;
    window.gsap.to(element, {
      scale: 0.975,
      y: 0,
      duration: 0.1,
      ease: "power2.out",
      overwrite: "auto"
    });
  }

  function release(element) {
    if (!gsapReady() || isDisabled(element)) return;
    const hovered = element.matches(":hover");
    window.gsap.to(element, {
      scale: hovered ? 1.012 : 1,
      y: hovered ? -2 : 0,
      duration: 0.18,
      ease: "power2.out",
      overwrite: "auto"
    });
  }

  function lift(element) {
    if (!gsapReady() || isDisabled(element)) return;
    window.gsap.to(element, {
      scale: 1.012,
      y: -2,
      duration: 0.22,
      ease: "power2.out",
      overwrite: "auto"
    });
  }

  function settle(element) {
    if (!gsapReady()) return;
    window.gsap.to(element, {
      scale: 1,
      y: 0,
      duration: 0.22,
      ease: "power2.out",
      overwrite: "auto"
    });
  }

  function addRipple(element, event) {
    if (!gsapReady() || isDisabled(element)) return;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    if (getComputedStyle(element).position === "static") {
      element.style.position = "relative";
    }

    const ripple = document.createElement("span");
    ripple.className = "motion-ripple";
    ripple.setAttribute("aria-hidden", "true");
    ripple.style.left = `${event.clientX - rect.left}px`;
    ripple.style.top = `${event.clientY - rect.top}px`;
    element.append(ripple);

    window.gsap.to(ripple, {
      scale: Math.max(rect.width, rect.height) / 8,
      autoAlpha: 0,
      duration: 0.48,
      ease: "power3.out",
      onComplete: () => ripple.remove()
    });
  }

  function bindInteractive(root = document) {
    root.querySelectorAll(interactiveSelector).forEach(element => {
      if (bound.has(element)) return;
      bound.add(element);
      element.dataset.motionBound = "true";
      element.addEventListener("pointerenter", event => {
        if (event.pointerType === "mouse") lift(element);
      });
      element.addEventListener("pointerleave", () => settle(element));
      element.addEventListener("pointerdown", () => press(element));
      element.addEventListener("pointerup", () => release(element));
      element.addEventListener("pointercancel", () => settle(element));
      element.addEventListener("blur", () => settle(element));
      element.addEventListener("click", event => addRipple(element, event));
    });
  }

  function visibleElements(elements) {
    return elements.filter(element => {
      if (!(element instanceof HTMLElement)) return false;
      if (element.hidden) return false;
      if (element.closest("[hidden]")) return false;
      return element.offsetParent !== null || element === document.body;
    });
  }

  function animateElements(elements, force = false) {
    if (!gsapReady()) return;
    const targets = visibleElements(elements).filter(element => force || !animated.has(element));
    if (!targets.length) return;

    targets.forEach(element => animated.add(element));
    window.gsap.fromTo(targets, {
      autoAlpha: 0,
      y: 16
    }, {
      autoAlpha: 1,
      y: 0,
      duration: 0.48,
      stagger: { each: 0.045, from: "start" },
      ease: "power2.out",
      overwrite: "auto",
      clearProps: "opacity,visibility,transform"
    });
  }

  function animateActiveSurface(force = false) {
    const activePage = document.querySelector(".page.active");
    const root = activePage || document.querySelector(".scenario-shell, .novel-shell, .admin-shell") || document.body;
    animateElements(Array.from(root.querySelectorAll(entranceSelector)), force);
  }

  function animateNewContent(node) {
    if (!(node instanceof HTMLElement)) return;
    bindInteractive(node);

    const targets = [];
    if (node.matches(entranceSelector)) targets.push(node);
    targets.push(...node.querySelectorAll(entranceSelector));
    animateElements(targets, node.matches(".choice-button, tbody tr, .reflection-item, .detail-card"));
  }

  function observeChanges() {
    const observer = new MutationObserver(records => {
      let shouldAnimateSurface = false;

      records.forEach(record => {
        record.addedNodes.forEach(node => animateNewContent(node));

        if (record.type === "attributes" && record.target instanceof HTMLElement) {
          const target = record.target;
          if (record.attributeName === "class" && target.classList.contains("active")) {
            shouldAnimateSurface = true;
          }
          if (record.attributeName === "hidden" && !target.hidden) {
            const targets = target.matches(entranceSelector) ? [target] : Array.from(target.querySelectorAll(entranceSelector));
            animateElements(targets, true);
          }
        }
      });

      if (shouldAnimateSurface) animateActiveSurface(true);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "hidden"]
    });
  }

  function initMotion() {
    if (!gsapReady()) return;
    window.gsap.defaults({ duration: 0.42, ease: "power2.out" });
    injectStyles();
    bindInteractive();
    animateActiveSurface();
    observeChanges();

    window.addEventListener("motion:content-added", event => {
      if (event.detail?.element instanceof HTMLElement) {
        animateNewContent(event.detail.element);
      } else {
        animateActiveSurface(true);
      }
    });

    window.addEventListener("motion:route-change", () => animateActiveSurface(true));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMotion, { once: true });
  } else {
    initMotion();
  }
})();

