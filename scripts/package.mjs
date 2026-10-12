import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const frontendOnly = process.argv.includes("--frontend-only");
const root = resolve(import.meta.dirname, "..");
const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
if (!existsSync(resolve(root, "dist/index.js"))) throw new Error("Build the Decky bundle first.");
const release = resolve(root, "release");
const stage = resolve(release, "stage");
const target = resolve(stage, "Decky Spotify");
rmSync(stage, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const file of ["dist", "plugin.json", "package.json", "LICENSE", "README.md", "THIRD_PARTY_NOTICES.md"]) cpSync(resolve(root, file), resolve(target, file), { recursive: true });
mkdirSync(resolve(target, "docs"), { recursive: true });
cpSync(resolve(root, "docs/backend.md"), resolve(target, "docs/backend.md"));
if (!frontendOnly) {
  for (const file of ["main.py", "py_modules", "scripts/measure-player.py"]) {
    mkdirSync(dirname(resolve(target, file)), { recursive: true });
    cpSync(resolve(root, file), resolve(target, file), { recursive: true, filter: source => !source.includes("__pycache__") });
  }
} else {
  const manifestPath = resolve(target, "plugin.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.publish.description = "Frontend-only UI prototype with simulated playback and no audio.";
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}
const require = createRequire(import.meta.url);
const seen = new Set();
function manifestPathFor(name, parent) {
  try { return require.resolve(`${name}/package.json`, { paths: [parent] }); }
  catch (error) {
    if (error.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error;
    // Some packages export their entry point but keep package.json private.
    let directory = dirname(require.resolve(name, { paths: [parent] }));
    while (true) {
      const candidate = resolve(directory, "package.json");
      if (existsSync(candidate) && JSON.parse(readFileSync(candidate, "utf8")).name === name) return candidate;
      const next = dirname(directory);
      if (next === directory) throw new Error(`Could not locate notices for ${name}`);
      directory = next;
    }
  }
}
function includeNotices(name, parent = root) {
  const packagePath = manifestPathFor(name, parent);
  const manifest = JSON.parse(readFileSync(packagePath, "utf8"));
  const identity = `${manifest.name}@${manifest.version}`;
  if (seen.has(identity)) return;
  seen.add(identity);
  const directory = dirname(packagePath);
  const notice = resolve(target, "third-party", identity.replaceAll("/", "-"));
  mkdirSync(notice, { recursive: true });
  writeFileSync(resolve(notice, "VERSION.txt"), `${identity}\nLicense: ${manifest.license}\n`);
  for (const file of readdirSync(directory).filter(file => /^(license|copying)/i.test(file))) cpSync(resolve(directory, file), resolve(notice, file), { recursive: true });
  // This package ships its copyright and MIT reference in the source header,
  // without a standalone license file. Preserve both the source and full text.
  if (name === "qrcode-generator") {
    cpSync(resolve(root, "scripts/notices/qrcode-generator-LICENSE.txt"), resolve(notice, "LICENSE.txt"));
    cpSync(resolve(directory, "dist/qrcode.mjs"), resolve(notice, "qrcode.mjs"));
  }
  if (name === "@decky/api") for (const file of ["src", "dist", "package.json", "README.md"]) cpSync(resolve(directory, file), resolve(notice, file), { recursive: true });
  for (const dependency of Object.keys(manifest.dependencies ?? {})) includeNotices(dependency, directory);
}
for (const name of ["@decky/api", "i18next", "react-i18next", "react", "react-dom", "qrcode-generator"]) includeNotices(name);
const archive = resolve(release, `decky-spotify-v${version}${frontendOnly ? "-frontend" : ""}.zip`);
rmSync(archive, { force: true });
execFileSync("zip", ["-qr", archive, "Decky Spotify"], { cwd: stage });
rmSync(stage, { recursive: true, force: true });
console.log(`Created ${archive}`);
