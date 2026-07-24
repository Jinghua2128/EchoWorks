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