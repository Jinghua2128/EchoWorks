import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), "utf8");
}
async function binary(path) {
  return readFile(new URL(path, root));
}

function skipGifSubBlocks(buffer, start) {
  let offset = start;
  while (offset < buffer.length) {
    const blockSize = buffer[offset];
    offset += 1;
    if (blockSize === 0) return offset;
    offset += blockSize;
  }
  throw new Error("GIF sub-block extends beyond the file");
}

function gifMetadata(buffer) {
  const header = buffer.toString("ascii", 0, 6);
  assert.ok(header === "GIF87a" || header === "GIF89a");
  const width = buffer.readUInt16LE(6);
  const height = buffer.readUInt16LE(8);
  const logicalScreenPacked = buffer[10];
  let offset = 13;
  if (logicalScreenPacked & 0x80) {
    offset += 3 * (2 ** ((logicalScreenPacked & 0x07) + 1));
  }

  let frames = 0;
  let transparentFrames = 0;
  while (offset < buffer.length) {
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      const extensionLabel = buffer[offset];
      offset += 1;
      if (extensionLabel === 0xf9 && buffer[offset] === 4 && (buffer[offset + 1] & 0x01)) {
        transparentFrames += 1;
      }
      offset = skipGifSubBlocks(buffer, offset);
      continue;
    }
    if (marker !== 0x2c) throw new Error(`Unexpected GIF block 0x${marker.toString(16)}`);

    frames += 1;
    const imagePacked = buffer[offset + 8];
    offset += 9;
    if (imagePacked & 0x80) {
      offset += 3 * (2 ** ((imagePacked & 0x07) + 1));
    }
    offset += 1;
    offset = skipGifSubBlocks(buffer, offset);
  }
  return { frames, header, height, transparentFrames, width };
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

  const characterAssets = new Set();
  for (const model of Object.values(characterModels)) {
    assert.ok(model.poses[model.defaultPose]);
    assert.ok(Object.keys(model.poses).length >= 3);
    for (const pose of Object.values(model.poses)) {
      characterAssets.add(pose.idle);
      characterAssets.add(pose.talk);
      characterAssets.add(pose.speaking);
      await access(new URL(pose.idle, root));
      await access(new URL(pose.talk, root));
      await access(new URL(pose.speaking, root));
    }
  }
  assert.deepEqual([...characterAssets].sort(), [
    "assets/characters/manager-lowpoly-idle.webp",
    "assets/characters/manager-lowpoly-speaking.gif",
    "assets/characters/manager-lowpoly-talk.webp",
    "assets/characters/sarah-lowpoly-idle.webp",
    "assets/characters/sarah-lowpoly-speaking.gif",
    "assets/characters/sarah-lowpoly-talk.webp"
  ]);

  const sceneBackgrounds = scenarioLibrary.scenarios.map(scenario => scenario.background);
  assert.equal(new Set(sceneBackgrounds).size, 4);
  for (const background of new Set(sceneBackgrounds)) {
    await access(new URL(scenarioLibrary.assets.backgrounds[background], root));
  }
});

test("speaking GIFs contain transparent multi-frame character animation", async () => {
  for (const asset of [
    "assets/characters/manager-lowpoly-speaking.gif",
    "assets/characters/sarah-lowpoly-speaking.gif"
  ]) {
    const metadata = gifMetadata(await binary(asset));
    assert.equal(metadata.header, "GIF89a");
    assert.equal(metadata.width, 512);
    assert.equal(metadata.height, 768);
    assert.equal(metadata.frames, 4);
    assert.equal(metadata.transparentFrames, 4);
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
