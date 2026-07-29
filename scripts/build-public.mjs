import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "public");
const runtimeFiles = [
  "index.html",
  "scenario.html",
  "test3.html",
  "admin.html",
  "privacy.html",
  "firebase-config.js",
  "robots.txt",
  "sitemap.xml",
  "assets/favicon.svg",
  "assets/office-vn.webp",
  "assets/office-success.webp",
  "assets/office-tense.webp",
  "assets/office-mentor.webp",
  "assets/ar-cards/CARE_A.png",
  "assets/ar-cards/CARE_C.png",
  "assets/ar-cards/CARE_E.png",
  "assets/ar-cards/CARE_R.png",
  "assets/ar-cards/REAL_A.png",
  "assets/ar-cards/REAL_E.png",
  "assets/ar-cards/REAL_L.png",
  "assets/ar-cards/REAL_R.png",
  "assets/ar-targets/echoworks-cards.mind",
  "assets/ar-models/care-a-lowpoly.webp",
  "assets/ar-models/care-c-lowpoly.webp",
  "assets/ar-models/care-e-lowpoly.webp",
  "assets/ar-models/care-r-lowpoly.webp",
  "assets/ar-models/real-a-lowpoly.webp",
  "assets/ar-models/real-e-lowpoly.webp",
  "assets/ar-models/real-l-lowpoly.webp",
  "assets/ar-models/real-r-lowpoly.webp",
  "assets/characters/character-models.js",
  "assets/characters/manager-lowpoly-explain-idle.webp",
  "assets/characters/manager-lowpoly-explain-talk.webp",
  "assets/characters/manager-lowpoly-idle.webp",
  "assets/characters/manager-lowpoly-reflect-idle.webp",
  "assets/characters/manager-lowpoly-reflect-talk.webp",
  "assets/characters/manager-lowpoly-talk.webp",
  "assets/characters/sarah-lowpoly-attentive-idle.webp",
  "assets/characters/sarah-lowpoly-attentive-talk.webp",
  "assets/characters/sarah-lowpoly-confident-idle.webp",
  "assets/characters/sarah-lowpoly-confident-talk.webp",
  "assets/characters/sarah-lowpoly-idle.webp",
  "assets/characters/sarah-lowpoly-talk.webp",
  "assets/css/admin.css",
  "assets/css/app.css",
  "assets/css/novel-visual.css",
  "assets/css/novel.css",
  "assets/css/tokens.css",
  "assets/data/ar-cards.json",
  "assets/data/pulse-surveys.json",
  "assets/data/scenarios/full-game-script.json",
  "assets/data/scenarios/scenario-library.json",
  "assets/js/admin.js",
  "assets/js/app.js",
  "assets/js/firebase-client.js",
  "assets/js/motion.js",
  "assets/js/novel.js",
  "assets/js/progress-store.js",
  "assets/js/scenario-engine.js",
  "assets/js/scenario-redirect.js",
  "assets/scenes/meeting-room.webp",
  "assets/scenes/office-corridor.webp",
  "assets/scenes/planning-workspace.webp",
  "assets/scenes/review-office.webp",
  "assets/vendor/gsap/NOTICE.txt",
  "assets/vendor/gsap/gsap.min.js",
  "assets/vendor/mindar/MINDAR-LICENSE.txt",
  "assets/vendor/mindar/THREE-LICENSE.txt",
  "assets/vendor/mindar/addons/renderers/CSS3DRenderer.js",
  "assets/vendor/mindar/controller-mGt1s8dJ.js",
  "assets/vendor/mindar/mindar-image-three.prod.js",
  "assets/vendor/mindar/three.module.js",
  "assets/vendor/mindar/ui-fBadYuor.js"
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of runtimeFiles) {
  const destination = join(output, file);
  await mkdir(dirname(destination), { recursive: true });
  await cp(join(root, file), destination);
}

console.log("Built " + output + " with " + runtimeFiles.length + " runtime files.");