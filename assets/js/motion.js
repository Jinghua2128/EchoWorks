(function () {
  "use strict";

  const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointerQuery = window.matchMedia("(pointer: fine)");
  const motionEnabled = !reduceMotionQuery.matches;
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
    ".auth-copy > *",
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
    ".insight-card",
    ".insight-item",
    "tbody tr",
    ".detail-card",
    ".reflection-item",
    ".admin-list-item"
  ].join(",");

  const revealSelector = [
    ".panel",
    ".unit-row",
    ".tool-card",
    ".scenario-card",
    ".role-card",
    ".choice-button",
    ".admin-metric",
    ".chart-card",
    ".insight-card",
    ".insight-item",
    ".detail-card",
    ".reflection-item"
  ].join(",");

  const animated = new WeakSet();
  const bound = new WeakSet();
  const magneticState = new WeakMap();
  let revealObserver = null;

  function gsapReady() {
    return motionEnabled && window.gsap;
  }

  function injectStyles() {
    if (document.getElementById("motionStyles")) return;

    const style = document.createElement("style");
    style.id = "motionStyles";
    style.textContent = `
      [data-motion-bound="true"] {
        will-change: transform;
      }

      .motion-page-veil {
        position: fixed;
        inset: 0;
        z-index: 9999;
        pointer-events: none;
        transform: scaleX(0);
        transform-origin: left center;
        background: linear-gradient(90deg, rgba(21, 25, 34, .96), rgba(143, 17, 24, .92));
      }

      .motion-ripple {
        position: absolute;
        z-index: 0;
        width: 18px;
        height: 18px;
        border-radius: 999px;
        background: rgba(143, 17, 24, .16);
        pointer-events: none;
        transform: translate(-50%, -50%) scale(0);
      }

      .button, .nav-button, .tool-card, .unit-row, .rating-option, .back-button,
      .icon-button, .text-button, .choice-button, .role-card, .filter-button, .admin-list-item {
        transform-origin: center;
      }
    `;
    document.head.append(style);
  }

  function ensurePageVeil() {
    let veil = document.querySelector(".motion-page-veil");
    if (!veil) {
      veil = document.createElement("div");
      veil.className = "motion-page-veil";
      veil.setAttribute("aria-hidden", "true");
      document.body.append(veil);
    }
    return veil;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function isDisabled(element) {
    return element.matches(":disabled") || element.getAttribute("aria-disabled") === "true";
  }

  function canUseMagnet(element) {
    return finePointerQuery.matches && element.matches(".button, .tool-card, .unit-row, .role-card, .choice-button, .admin-list-item");
  }

  function stateFor(element) {
    if (!window.gsap || !canUseMagnet(element)) return null;
    if (magneticState.has(element)) return magneticState.get(element);

    const state = {
      xTo: window.gsap.quickTo(element, "x", { duration: 0.42, ease: "power3.out" }),
      yTo: window.gsap.quickTo(element, "y", { duration: 0.42, ease: "power3.out" })
    };
    magneticState.set(element, state);
    return state;
  }

  function press(element) {
    if (!gsapReady() || isDisabled(element)) return;
    window.gsap.to(element, {
      scale: 0.982,
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
      duration: 0.2,
      ease: "power3.out",
      overwrite: "auto"
    });
  }

  function lift(element) {
    if (!gsapReady() || isDisabled(element)) return;
    window.gsap.to(element, {
      scale: 1.012,
      duration: 0.24,
      ease: "power3.out",
      overwrite: "auto"
    });
  }

  function settle(element) {
    if (!gsapReady()) return;
    const state = magneticState.get(element);
    if (state) {
      state.xTo(0);
      state.yTo(0);
    }

    window.gsap.to(element, {
      x: 0,
      y: 0,
      scale: 1,
      rotationX: 0,
      rotationY: 0,
      duration: 0.3,
      ease: "power3.out",
      overwrite: "auto"
    });
  }

  function magneticMove(element, event) {
    if (!gsapReady() || isDisabled(element)) return;
    const state = stateFor(element);
    if (!state) return;

    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const relX = event.clientX - rect.left - rect.width / 2;
    const relY = event.clientY - rect.top - rect.height / 2;
    state.xTo(clamp(relX / 18, -8, 8));
    state.yTo(clamp(relY / 20, -6, 6));
  }

  function addRipple(element, event) {
    if (!gsapReady() || isDisabled(element)) return;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    if (getComputedStyle(element).position === "static") {
      element.style.position = "relative";
    }

    element.style.overflow = element.style.overflow || "hidden";

    const ripple = document.createElement("span");
    ripple.className = "motion-ripple";
    ripple.setAttribute("aria-hidden", "true");
    ripple.style.left = `${event.clientX - rect.left}px`;
    ripple.style.top = `${event.clientY - rect.top}px`;
    element.append(ripple);

    window.gsap.to(ripple, {
      scale: Math.max(rect.width, rect.height) / 7,
      autoAlpha: 0,
      duration: 0.52,
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
      element.addEventListener("pointermove", event => magneticMove(element, event));
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
      y: 22,
      scale: 0.985,
      filter: "blur(5px)"
    }, {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      duration: 0.62,
      stagger: { each: 0.045, from: "start" },
      ease: "power3.out",
      overwrite: "auto",
      clearProps: "opacity,visibility,transform,filter"
    });
  }

  function activeRoot() {
    return document.querySelector(".page.active") || document.querySelector(".scenario-shell, .novel-shell, .admin-shell") || document.body;
  }

  function animateActiveSurface(force = false) {
    const root = activeRoot();
    animateElements(Array.from(root.querySelectorAll(entranceSelector)), force);
  }

  function transitionActiveSurface() {
    if (!gsapReady()) return;

    const veil = ensurePageVeil();
    const tl = window.gsap.timeline({ defaults: { ease: "power3.inOut" } });
    tl.set(veil, { transformOrigin: "left center", scaleX: 0 })
      .to(veil, { scaleX: 1, duration: 0.18 })
      .add(() => animateActiveSurface(true), "<0.06")
      .set(veil, { transformOrigin: "right center" })
      .to(veil, { scaleX: 0, duration: 0.34 });
  }

  function animateTextRefresh(element) {
    if (!gsapReady() || !(element instanceof HTMLElement) || element.closest("[hidden]")) return;
    window.gsap.fromTo(element, {
      autoAlpha: 0,
      y: 8
    }, {
      autoAlpha: 1,
      y: 0,
      duration: 0.28,
      ease: "power2.out",
      overwrite: "auto",
      clearProps: "opacity,visibility,transform"
    });
  }

  function animateNewContent(node) {
    if (!(node instanceof HTMLElement)) return;
    bindInteractive(node);

    const targets = [];
    if (node.matches(entranceSelector)) targets.push(node);
    targets.push(...node.querySelectorAll(entranceSelector));
    animateElements(targets, node.matches(".choice-button, tbody tr, .reflection-item, .detail-card, .insight-item"));
    observeRevealTargets(node);
  }

  function observeRevealTargets(root = document) {
    if (!revealObserver || !root.querySelectorAll) return;
    root.querySelectorAll(revealSelector).forEach(element => {
      if (!element.dataset.revealBound) {
        element.dataset.revealBound = "true";
        revealObserver.observe(element);
      }
    });
  }

  function setupRevealObserver() {
    if (!gsapReady() || !("IntersectionObserver" in window)) return;

    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        animateElements([entry.target]);
        revealObserver.unobserve(entry.target);
      });
    }, {
      root: null,
      threshold: 0.16,
      rootMargin: "0px 0px -8% 0px"
    });

    observeRevealTargets(document);
  }

  function observeChanges() {
    const observer = new MutationObserver(records => {
      let shouldAnimateSurface = false;

      records.forEach(record => {
        if (record.type === "childList") {
          record.addedNodes.forEach(node => animateNewContent(node));
          if (record.target instanceof HTMLElement && record.target.matches("#reflectionSummary, #scoreTotal")) {
            animateTextRefresh(record.target);
          }
        }

        if (record.type === "attributes" && record.target instanceof HTMLElement) {
          const target = record.target;
          if (record.attributeName === "class" && target.classList.contains("active") && target.classList.contains("page")) {
            shouldAnimateSurface = true;
          }
          if (record.attributeName === "hidden" && !target.hidden) {
            const targets = target.matches(entranceSelector) ? [target] : Array.from(target.querySelectorAll(entranceSelector));
            animateElements(targets, true);
            bindInteractive(target);
            observeRevealTargets(target);
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

  function animateInitialHero() {
    if (!gsapReady()) return;
    const authCopy = document.querySelectorAll(".auth-copy > *");
    const authCards = document.querySelectorAll(".auth-card");
    if (!authCopy.length && !authCards.length) return;

    [...authCopy, ...authCards].forEach(element => animated.add(element));

    window.gsap.timeline({ defaults: { duration: 0.68, ease: "power3.out" } })
      .fromTo(authCopy, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, stagger: 0.08, clearProps: "opacity,visibility,transform" }, 0)
      .fromTo(".auth-card", { autoAlpha: 0, y: 24, scale: 0.985 }, { autoAlpha: 1, y: 0, scale: 1, clearProps: "opacity,visibility,transform" }, 0.12);
  }

  function initMotion() {
    if (!gsapReady()) return;
    window.gsap.config({ nullTargetWarn: false });
    window.gsap.defaults({ duration: 0.44, ease: "power3.out" });

    injectStyles();
    bindInteractive();
    setupRevealObserver();
    animateInitialHero();
    animateActiveSurface();
    observeChanges();

    window.addEventListener("motion:content-added", event => {
      if (event.detail?.element instanceof HTMLElement) {
        animateNewContent(event.detail.element);
      } else {
        animateActiveSurface(true);
      }
    });

    window.addEventListener("motion:route-change", transitionActiveSurface);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMotion, { once: true });
  } else {
    initMotion();
  }
})();