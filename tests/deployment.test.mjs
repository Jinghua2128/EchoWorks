import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), "utf8");
}

test("public routes include production metadata and safe scenario redirect", async () => {
  const [index, scenario, admin, redirect, firebase] = await Promise.all([
    text("index.html"), text("scenario.html"), text("admin.html"), text("test3.html"), text("firebase.json")
  ]);
  assert.match(index, /Content-Security-Policy/);
  assert.match(index, /rel="canonical"/);
  assert.match(index, /twitter:card/);
  assert.match(scenario, /assets\/vendor\/gsap\/gsap\.min\.js/);
  assert.match(admin, /noindex,nofollow,noarchive/);
  assert.match(redirect, /scenario\.html/);
  assert.equal(firebase.includes('"public":  "public"') || firebase.includes('"public": "public"'), true);
  await access(new URL("assets/vendor/gsap/gsap.min.js", root));
});
test("dynamic character poses and scenario backgrounds are centralized and deployable", async () => {
  const { characterModels } = await import("../assets/characters/character-models.js");
  const scenarioMarkup = await text("scenario.html");
  const scenarioLibrary = JSON.parse(await text("assets/data/scenarios/scenario-library.json"));
  assert.match(scenarioMarkup, /data-character-model="manager"/);
  assert.match(scenarioMarkup, /data-character-model="employee"/);

  for (const model of Object.values(characterModels)) {
    assert.ok(model.poses[model.defaultPose]);
    assert.ok(Object.keys(model.poses).length >= 3);
    for (const pose of Object.values(model.poses)) {
      await access(new URL(pose.idle, root));
      await access(new URL(pose.talk, root));
    }
  }

  const sceneBackgrounds = scenarioLibrary.scenarios.map(scenario => scenario.background);
  assert.equal(new Set(sceneBackgrounds).size, 4);
  for (const background of new Set(sceneBackgrounds)) {
    await access(new URL(scenarioLibrary.assets.backgrounds[background], root));
  }
});

test("AR card overlays use a consistent card-specific low-poly pose set", async () => {
  const arCards = JSON.parse(await text("assets/data/ar-cards.json"));
  const app = await text("assets/js/app.js");
  const characterImages = new Set(arCards.cards.map(card => card.characterImage));
  assert.equal(arCards.cards.length, 8);
  assert.equal(characterImages.size, 8);
  assert.match(app, /const arAssetVersion = "20260729-base-locked-ar-poses"/);
  for (const card of arCards.cards) {
    assert.equal(card.characterImage, `assets/ar-models/${card.id}-lowpoly.webp`);
    await access(new URL(card.characterImage, root));
  }
});

test("production manifest excludes retired prototypes and source-only artwork", async () => {
  const build = await text("scripts/build-public.mjs");
  assert.doesNotMatch(build, /runtimeDirectories|assets\/ar\//);
  assert.doesNotMatch(build, /sarah-(manager|employee)\.json|assets\/design|\.png".*office-/);
});
