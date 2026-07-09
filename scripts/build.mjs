import { chmod, cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const EXPORT_DIR = path.join(ROOT, "export");

await rm(path.join(PUBLIC_DIR, "export"), { recursive: true, force: true });
await mkdir(path.join(PUBLIC_DIR, "data"), { recursive: true });
await mkdir(path.join(PUBLIC_DIR, "export"), { recursive: true });
await cp(path.join(ROOT, "sourceBase.json"), path.join(PUBLIC_DIR, "data", "events.json"));
await cp(path.join(ROOT, "personalIndex.json"), path.join(PUBLIC_DIR, "data", "personal-index.json"));
await cp(path.join(ROOT, "exceptionCategories.json"), path.join(PUBLIC_DIR, "data", "category-exclusions.json"));
await cp(EXPORT_DIR, path.join(PUBLIC_DIR, "export"), { recursive: true });
await chmodPublic(PUBLIC_DIR);
console.log("Static data copied to public/data/events.json, personal-index.json, category exclusions, and public/export/");

async function chmodPublic(target) {
  const info = await stat(target);
  await chmod(target, info.isDirectory() ? 0o755 : 0o644);
  if (!info.isDirectory()) return;
  const entries = await readdir(target);
  await Promise.all(entries.map((entry) => chmodPublic(path.join(target, entry))));
}
