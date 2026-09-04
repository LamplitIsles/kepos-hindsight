import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const PUBLIC_PACKAGE = {
  directory: ".",
  name: "@lamplitisles/kepos-hindsight",
  requiredFiles: [
    "dist/dsh.js",
    "dist/dsh.d.ts",
    "dist/index.js",
    "dist/index.d.ts",
    "dist/client.js",
    "dist/client.d.cts",
    "cordis.patch.yml",
    "README.md",
    "LICENSE",
  ],
} as const;

const numericIdentifier = "(?:0|[1-9]\\d*)";
const nonNumericIdentifier = "(?:\\d*[A-Za-z-][0-9A-Za-z-]*)";
const preReleaseIdentifier = `(?:${numericIdentifier}|${nonNumericIdentifier})`;
const buildIdentifier = "(?:[0-9A-Za-z-]+)";
const tagPattern = new RegExp(
  `^v${numericIdentifier}\\.${numericIdentifier}\\.${numericIdentifier}` +
    `(?:-${preReleaseIdentifier}(?:\\.${preReleaseIdentifier})*)?` +
    `(?:\\+${buildIdentifier}(?:\\.${buildIdentifier})*)?$`,
);

export function versionFromTag(tag: string): string {
  if (!tagPattern.test(tag)) {
    throw new Error(
      "Release tags must use v<semver>, for example v0.1.0 or v0.1.0-beta.1.",
    );
  }
  return tag.slice(1);
}

export function npmDistTag(tag: string): "latest" | "beta" {
  versionFromTag(tag);
  return tag.includes("-") ? "beta" : "latest";
}

export function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

type PackedPackage = {
  filename?: string;
  files?: Array<{ path?: string }>;
};

export type PackedManifest = PackedPackage[] | Record<string, PackedPackage>;

export function packedManifest(
  packed: PackedManifest,
): PackedPackage | undefined {
  return Array.isArray(packed) ? packed[0] : Object.values(packed)[0];
}

export function packedFilePaths(packed: PackedManifest): Set<string> {
  const manifest = packedManifest(packed);
  const paths = manifest?.files?.flatMap((file) =>
    file.path === undefined ? [] : [file.path],
  );
  return new Set(paths);
}

export function checkReleaseManifests(root: string, tag: string): string[] {
  const errors: string[] = [];
  const version = versionFromTag(tag);
  const manifest = readJson(join(root, "package.json"));
  const repository = "https://github.com/LamplitIsles/kepos-hindsight.git";

  if (manifest.name !== PUBLIC_PACKAGE.name) {
    errors.push(`${PUBLIC_PACKAGE.directory} has the wrong npm name.`);
  }
  if (manifest.version !== version) {
    errors.push(`${PUBLIC_PACKAGE.name} version does not match ${tag}.`);
  }
  if (manifest.private === true) {
    errors.push(`${PUBLIC_PACKAGE.name} must be public.`);
  }

  const manifestRepository = manifest.repository as
    | { url?: unknown }
    | undefined;
  if (manifestRepository?.url !== repository) {
    errors.push(`${PUBLIC_PACKAGE.name} has the wrong repository.`);
  }

  const publishConfig = manifest.publishConfig as
    | { registry?: unknown; access?: unknown }
    | undefined;
  if (
    publishConfig?.registry !== "https://registry.npmjs.org" ||
    publishConfig.access !== "public"
  ) {
    errors.push(`${PUBLIC_PACKAGE.name} must publish publicly to npm.`);
  }

  if (JSON.stringify(manifest).includes("workspace:")) {
    errors.push(`${PUBLIC_PACKAGE.name} leaks a workspace protocol.`);
  }

  const scripts = (manifest.scripts ?? {}) as Record<string, unknown>;
  if (["install", "preinstall", "postinstall"].some((name) => name in scripts)) {
    errors.push(`${PUBLIC_PACKAGE.name} must not have install hooks.`);
  }

  return errors;
}

export function checkPackedManifests(root: string): string[] {
  const errors: string[] = [];
  const entry = PUBLIC_PACKAGE;
  const packageDirectory = join(root, entry.directory);
  if (
    entry.requiredFiles.some(
      (file) => !existsSync(join(packageDirectory, file)),
    )
  ) {
    errors.push(`${entry.name} is not built before release preflight.`);
    return errors;
  }

  let packed: PackedManifest;
  try {
    packed = JSON.parse(
      execFileSync("npm", ["pack", "--json", "--dry-run"], {
        cwd: packageDirectory,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    ) as PackedManifest;
  } catch {
    errors.push(`${entry.name} could not produce a packed manifest.`);
    return errors;
  }

  const files = packedFilePaths(packed);
  for (const required of entry.requiredFiles) {
    if (!files.has(required)) {
      errors.push(`${entry.name} packed manifest omits ${required}.`);
    }
  }
  if (
    [...files].some(
      (file) => file.includes("node_modules") || file.endsWith(".tgz"),
    )
  ) {
    errors.push(`${entry.name} packed manifest contains an unsafe build artifact.`);
  }
  return errors;
}
