import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDashboardSampleData } from "./dashboard-sample-data.mjs";

const outputUrl = new URL("../sample-data/firestore-dashboard-sample.json", import.meta.url);
const outputPath = fileURLToPath(outputUrl);
const sample = await buildDashboardSampleData();

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(sample, null, 2) + "\n", "utf8");

console.log("Wrote synthetic Firestore preview to " + outputPath);
console.log(JSON.stringify(sample.metadata.counts, null, 2));
