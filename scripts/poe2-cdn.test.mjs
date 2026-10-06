import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const datPkg = path.resolve(path.dirname(require.resolve("pathofexile-dat/bundles.js")), "..");

const { CdnBundleLoader } = await import(
  pathToFileURL(path.join(datPkg, "dist/cli/bundle-loaders.js")).href
);
const { exportTables } = await import(
  pathToFileURL(path.join(datPkg, "dist/cli/export-tables.js")).href
);
const { SCHEMA_VERSION } = await import(
  pathToFileURL(path.join(datPkg, "../pathofexile-dat-schema/dist/types.js")).href
);

async function withFetch(handler, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("PoE2 patch 0.5.5.4 is downloaded from patch-poe2.poecdn.com", async () => {
  const cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), "poe2-cdn-"));
  const urls = [];
  try {
    await withFetch(async (url) => {
      urls.push(String(url));
      return new Response(new Uint8Array(8), { status: 200 });
    }, async () => {
      const loader = await CdnBundleLoader.create(cacheRoot, "0.5.5.4");
      await loader.fetchFile("_.index.bin");
    });
    assert.deepEqual(urls, [
      "https://patch-poe2.poecdn.com/0.5.5.4/Bundles2/_.index.bin",
    ]);
  } finally {
    await fs.rm(cacheRoot, { recursive: true, force: true });
  }
});

test("legacy PoE2 patch 4.5.5.4 stays on patch-poe2.poecdn.com", async () => {
  const cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), "poe2-cdn-"));
  const urls = [];
  try {
    await withFetch(async (url) => {
      urls.push(String(url));
      return new Response(new Uint8Array(8), { status: 200 });
    }, async () => {
      const loader = await CdnBundleLoader.create(cacheRoot, "4.5.5.4");
      await loader.fetchFile("_.index.bin");
    });
    assert.deepEqual(urls, [
      "https://patch-poe2.poecdn.com/4.5.5.4/Bundles2/_.index.bin",
    ]);
  } finally {
    await fs.rm(cacheRoot, { recursive: true, force: true });
  }
});

test("PoE2 patch 0.5.5.4 exports tables from Data/Balance", async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "poe2-tables-"));
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => {
    logs.push(args.join(" "));
  };
  try {
    await withFetch(async () => {
      return Response.json({ version: SCHEMA_VERSION, tables: [] });
    }, async () => {
      await exportTables(
        {
          patch: "0.5.5.4",
          tables: [{ name: "BaseItemTypes", columns: ["Id"] }],
          translations: ["English"],
        },
        outDir,
        {
          bundleLoader: {
            clearBundleCache() {},
          },
          async tryGetFileContents() {
            throw new Error("stop after path selection");
          },
          async getFileContents() {
            throw new Error("stop after path selection");
          },
        }
      );
    });
    assert.fail("export should stop once the table path is chosen");
  } catch (error) {
    assert.equal(error instanceof Error ? error.message : "", "stop after path selection");
  } finally {
    console.log = originalLog;
    await fs.rm(outDir, { recursive: true, force: true });
  }
  assert.ok(
    logs.some((line) => line.includes("Data/Balance/BaseItemTypes")),
    `expected PoE2 table path, got:\n${logs.join("\n")}`
  );
});
