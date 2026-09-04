import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { releaseCheck } from "../scripts/release-check.js";
import {
  npmDistTag,
  packedFilePaths,
  packedManifest,
  versionFromTag,
} from "../scripts/release-shared.js";
import { synchronizeReleaseVersions } from "../scripts/sync-release-version.js";

const fixtures: string[] = [];

async function fixture(version = "0.1.0"): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "kepos-hindsight-release-"));
  fixtures.push(root);
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "@lamplitisles/kepos-hindsight",
      version,
      repository: {
        type: "git",
        url: "https://github.com/LamplitIsles/kepos-hindsight.git",
      },
      publishConfig: {
        registry: "https://registry.npmjs.org",
        access: "public",
      },
    }),
  );
  return root;
}

afterEach(async () => {
  await Promise.all(
    fixtures
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("release invariants", () => {
  it("reads npm 12 packed-manifest output", () => {
    const packed = {
      "@lamplitisles/kepos-hindsight": {
        filename: "lamplitisles-kepos-hindsight-0.1.0.tgz",
        files: [{ path: "dist/dsh.js" }, { path: "cordis.patch.yml" }],
      },
    } as unknown as Parameters<typeof packedFilePaths>[0];
    const files = packedFilePaths(packed);

    expect(files).toEqual(new Set(["dist/dsh.js", "cordis.patch.yml"]));
    expect(packedManifest(packed)?.filename).toBe(
      "lamplitisles-kepos-hindsight-0.1.0.tgz",
    );
  });

  it("accepts matching stable and prerelease tags and chooses their npm channels", async () => {
    const root = await fixture();

    expect(releaseCheck(root, "v0.1.0", false)).toEqual([]);
    expect(versionFromTag("v0.1.0-beta.1")).toBe("0.1.0-beta.1");
    expect(npmDistTag("v0.1.0")).toBe("latest");
    expect(npmDistTag("v0.1.0-beta.1")).toBe("beta");
    expect(() => versionFromTag("release-0.1.0")).toThrow("v<semver>");
  });

  it("rejects a package version that does not match the release tag", async () => {
    const root = await fixture("0.1.1");

    expect(releaseCheck(root, "v0.1.0", false)).toContain(
      "@lamplitisles/kepos-hindsight version does not match v0.1.0.",
    );
  });

  it("synchronizes the package version from a prerelease tag", async () => {
    const root = await fixture();

    await synchronizeReleaseVersions(root, "v0.1.0-beta.1");

    const manifest = JSON.parse(
      await readFile(join(root, "package.json"), "utf8"),
    ) as { version: string };
    expect(manifest.version).toBe("0.1.0-beta.1");
    expect(releaseCheck(root, "v0.1.0-beta.1", false)).toEqual([]);
  });
});
