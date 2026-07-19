(function () {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(pointer: fine)");
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
    ".admin-list-item button"
  ].join(",");
  const dynamicSelector = [
    ".unit-row",
    ".rating-option",
    ".choice-button",
    ".insight-item",
    "tbody tr",
    ".detail-card",
    ".reflection-item",
    ".admin-list-item",
    ".result-toast"
  ].join(",");

  const bound = new WeakSet();
  const animated = new WeakSet();
  let routeFrame = 0;

  function motionReady() {
    return !reducedMotion.matches && Boolean(window.gsap);
  }

  function isDisabled(element) {
    return element.matches(":disabled") || element.getAttribute("aria-disabled") === "true";
  }

  function isVisible(element) {
    return element instanceof HTMLElement
      && !element.hidden
      && !element.closest("[hidden]")
      && element.offsetParent !== null;
  }

  function settle(element) {
    if (!motionReady()) return;
    window.gsap.to(element, {
      y: 0,
      scale: 1,
      duration: 0.18,
      ease: "power1.out",
      overwrite: "auto",
      clearProps: "transform"
    });
  }

  function bindInteractive(root = document) {
    const elements = [];
    if (root instanceof HTMLElement && root.matches(interactiveSelector)) elements.push(root);
    if (root.querySelectorAll) elements.push(...root.querySelectorAll(interactiveSelector));

    elements.forEach(element => {
      if (bound.has(element)) return;
      bound.add(element);

      element.addEventListener("pointerenter", event => {
        if (!motionReady() || !finePointer.matches || event.pointerType !== "mouse" || isDisabled(element)) return;
        window.gsap.to(element, {
          y: -1,
          duration: 0.16,
          ease: "power1.out",
          overwrite: "auto"
        });
      });

      element.addEventListener("pointerleave", () => settle(element));
      element.addEventListener("pointercancel", () => settle(element));
      element.addEventListener("blur", () => settle(element));

      element.addEventListener("pointerdown", () => {
        if (!motionReady() || isDisabled(element)) return;
        window.gsap.to(element, {
          scale: 0.985,
          duration: 0.08,
          ease: "power1.out",
          overwrite: "auto"
        });
      });

      element.addEventListener("pointerup", () => {
        if (!motionReady() || isDisabled(element)) return;
        window.gsap.to(element, {
          scale: 1,
          duration: 0.16,
          ease: "power1.out",
          overwrite: "auto",
          clearProps: "scale"
        });
      });
    });
  }

  function dynamicTargets(root) {
    const targets = [];
    if (root instanceof HTMLElement && root.matches(dynamicSelector)) targets.push(root);
    if (root?.querySelectorAll) targets.push(...root.querySelectorAll(dynamicSelector));
    return targets.filter(element => isVisible(element) && !animated.has(element));
  }

  function revealDynamic(root) {
    bindInteractive(root);
    if (!motionReady()) return;

    const targets = dynamicTargets(root);
    if (!targets.length) return;
    targets.forEach(element => animated.add(element));

    window.gsap.fromTo(targets, {
      autoAlpha: 0.72,
      y: 6
    }, {
      autoAlpha: 1,
      y: 0,
      duration: 0.2,
      stagger: 0.025,
      ease: "power1.out",
      overwrite: "auto",
      clearProps: "opacity,visibility,transform"
    });
  }

  function animateRoute() {
    if (!motionReady()) return;
    const surface = document.querySelector(".page.active");
    if (!(surface instanceof HTMLElement) || !isVisible(surface)) return;

    window.gsap.killTweensOf(surface);
    window.gsap.fromTo(surface, {
      autoAlpha: 0.96,
      y: 4
    }, {
      autoAlpha: 1,
      y: 0,
      duration: 0.2,
      ease: "power1.out",
      overwrite: "auto",
      clearProps: "opacity,visibility,transform"
    });
  }

  function scheduleRouteAnimation() {
    cancelAnimationFrame(routeFrame);
    routeFrame = requestAnimationFrame(animateRoute);
  }

  function observeChanges() {
    const observer = new MutationObserver(records => {
      records.forEach(record => {
        if (record.type === "childList") {
          record.addedNodes.forEach(node => {
            if (node instanceof HTMLElement) revealDynamic(node);
          });
          return;
        }

        if (!(record.target instanceof HTMLElement)) return;
        const target = record.target;
        if (record.attributeName === "class" && target.matches(".page.active")) {
          scheduleRouteAnimation();
        }
        if (record.attributeName === "hidden" && !target.hidden) {
          revealDynamic(target);
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "hidden"]
    });
  }

  function initMotion() {
    if (!window.gsap) return;
    window.gsap.config({ nullTargetWarn: false });
    bindInteractive();
    observeChanges();

    window.addEventListener("motion:content-added", event => {
      revealDynamic(event.detail?.element || document);
    });
    window.addEventListener("motion:route-change", scheduleRouteAnimation);
    reducedMotion.addEventListener?.("change", () => {
      if (reducedMotion.matches) window.gsap.killTweensOf("*");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMotion, { once: true });
  } else {
    initMotion();
  }
})();