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
  "assets/manager.webp",
  "assets/manager_talk.webp",
  "assets/sarah.webp",
  "assets/sarah_talk.webp",
  "assets/office-vn.webp",
  "assets/office-success.webp",
  "assets/office-tense.webp",
  "assets/office-mentor.webp"
];
const runtimeDirectories = [
  "assets/ar",
  "assets/css",
  "assets/data",
  "assets/js",
  "assets/vendor/gsap",
  "assets/vendor/mindar"
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of runtimeFiles) {
  const destination = join(output, file);
  await mkdir(dirname(destination), { recursive: true });
  await cp(join(root, file), destination);
}
for (const directory of runtimeDirectories) {
  await cp(join(root, directory), join(output, directory), { recursive: true });
}

console.log(`Built ${output} with runtime files only.`);