import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, realpathSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import sharp from "sharp";
import {
  findProjectIcon,
  getProjectIcon,
  deriveProjectIconEdgeColor,
  ICON_PATTERNS,
  PRIORITY_DIRS,
  IGNORED_DIRS,
  MONOREPO_PACKAGE_DIRS,
  normalizeProjectIconRelativePath,
} from "./project-icon.js";

function createTempDir(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), "project-icon-test-")));
}

describe("findProjectIcon", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("ICON_PATTERNS", () => {
    it("includes common favicon patterns", () => {
      expect(ICON_PATTERNS).toContain("favicon.ico");
      expect(ICON_PATTERNS).toContain("favicon.png");
      expect(ICON_PATTERNS).toContain("favicon.svg");
    });

    it("includes app icon patterns", () => {
      expect(ICON_PATTERNS).toContain("icon.png");
      expect(ICON_PATTERNS).toContain("icon.svg");
      expect(ICON_PATTERNS).toContain("app-icon.png");
    });

    it("includes logo patterns", () => {
      expect(ICON_PATTERNS).toContain("logo.png");
      expect(ICON_PATTERNS).toContain("logo.svg");
    });
  });

  describe("PRIORITY_DIRS", () => {
    it("includes common asset directories", () => {
      expect(PRIORITY_DIRS).toContain("public");
      expect(PRIORITY_DIRS).toContain("static");
      expect(PRIORITY_DIRS).toContain("assets");
    });

    it("includes Phoenix static assets directory", () => {
      expect(PRIORITY_DIRS).toContain("priv/static");
    });
  });

  describe("IGNORED_DIRS", () => {
    it("includes common ignored directories", () => {
      expect(IGNORED_DIRS).toContain(".git");
      expect(IGNORED_DIRS).toContain("node_modules");
      expect(IGNORED_DIRS).toContain("dist");
      expect(IGNORED_DIRS).toContain("build");
    });
  });

  describe("MONOREPO_PACKAGE_DIRS", () => {
    it("includes common monorepo package directories", () => {
      expect(MONOREPO_PACKAGE_DIRS).toContain("packages");
      expect(MONOREPO_PACKAGE_DIRS).toContain("apps");
    });
  });

  it("returns null when no icon is found", async () => {
    const result = await findProjectIcon(tempDir);
    expect(result).toBeNull();
  });

  it("finds favicon.ico in root directory", async () => {
    writeFileSync(join(tempDir, "favicon.ico"), "icon content");

    const result = await findProjectIcon(tempDir);
    expect(result).toBe(join(tempDir, "favicon.ico"));
  });

  it("finds favicon.png in root directory", async () => {
    writeFileSync(join(tempDir, "favicon.png"), "icon content");

    const result = await findProjectIcon(tempDir);
    expect(result).toBe(join(tempDir, "favicon.png"));
  });

  it("finds icon in public directory (priority dir)", async () => {
    mkdirSync(join(tempDir, "public"));
    writeFileSync(join(tempDir, "public", "favicon.ico"), "icon content");

    const result = await findProjectIcon(tempDir);
    expect(result).toBe(join(tempDir, "public", "favicon.ico"));
  });

  it("finds icon in static directory (priority dir)", async () => {
    mkdirSync(join(tempDir, "static"));
    writeFileSync(join(tempDir, "static", "favicon.svg"), "icon content");

    const result = await findProjectIcon(tempDir);
    expect(result).toBe(join(tempDir, "static", "favicon.svg"));
  });

  it("finds icon in Phoenix priv/static directory", async () => {
    mkdirSync(join(tempDir, "priv", "static"), { recursive: true });
    writeFileSync(join(tempDir, "priv", "static", "favicon.ico"), "icon content");

    const result = await findProjectIcon(tempDir);
    expect(result).toBe(join(tempDir, "priv", "static", "favicon.ico"));
  });

  it("finds icon in assets directory (priority dir)", async () => {
    mkdirSync(join(tempDir, "assets"));
    writeFileSync(join(tempDir, "assets", "logo.png"), "icon content");

    const result = await findProjectIcon(tempDir);
    expect(result).toBe(join(tempDir, "assets", "logo.png"));
  });

  it("prioritizes favicon over logo", async () => {
    writeFileSync(join(tempDir, "favicon.ico"), "favicon");
    writeFileSync(join(tempDir, "logo.png"), "logo");

    const result = await findProjectIcon(tempDir);
    expect(result).toBe(join(tempDir, "favicon.ico"));
  });

  it("prioritizes priority dirs over root", async () => {
    writeFileSync(join(tempDir, "logo.png"), "root logo");
    mkdirSync(join(tempDir, "public"));
    writeFileSync(join(tempDir, "public", "favicon.ico"), "public favicon");

    const result = await findProjectIcon(tempDir);
    expect(result).toBe(join(tempDir, "public", "favicon.ico"));
  });

  it("ignores files in .git directory", async () => {
    mkdirSync(join(tempDir, ".git"));
    writeFileSync(join(tempDir, ".git", "favicon.ico"), "git icon");

    const result = await findProjectIcon(tempDir);
    expect(result).toBeNull();
  });

  it("ignores files in node_modules directory", async () => {
    mkdirSync(join(tempDir, "node_modules"));
    writeFileSync(join(tempDir, "node_modules", "favicon.ico"), "node icon");

    const result = await findProjectIcon(tempDir);
    expect(result).toBeNull();
  });

  it("ignores files in dist directory", async () => {
    mkdirSync(join(tempDir, "dist"));
    writeFileSync(join(tempDir, "dist", "favicon.ico"), "dist icon");

    const result = await findProjectIcon(tempDir);
    expect(result).toBeNull();
  });

  it("finds icon in nested priority directory", async () => {
    mkdirSync(join(tempDir, "public", "images"), { recursive: true });
    writeFileSync(join(tempDir, "public", "images", "favicon.png"), "nested icon");

    const result = await findProjectIcon(tempDir);
    expect(result).toBe(join(tempDir, "public", "images", "favicon.png"));
  });

  it("finds apple-touch-icon.png", async () => {
    writeFileSync(join(tempDir, "apple-touch-icon.png"), "apple icon");

    const result = await findProjectIcon(tempDir);
    expect(result).toBe(join(tempDir, "apple-touch-icon.png"));
  });

  it("finds icon-*.png patterns", async () => {
    writeFileSync(join(tempDir, "icon-192.png"), "192 icon");

    const result = await findProjectIcon(tempDir);
    expect(result).toBe(join(tempDir, "icon-192.png"));
  });

  it("handles non-existent directory gracefully", async () => {
    const result = await findProjectIcon(join(tempDir, "nonexistent"));
    expect(result).toBeNull();
  });

  it("returns the first match when multiple icons exist in same location", async () => {
    writeFileSync(join(tempDir, "favicon.ico"), "ico");
    writeFileSync(join(tempDir, "favicon.png"), "png");
    writeFileSync(join(tempDir, "favicon.svg"), "svg");

    const result = await findProjectIcon(tempDir);
    // Should return the first one based on pattern order (favicon.ico comes first)
    expect(result).toBe(join(tempDir, "favicon.ico"));
  });

  describe("monorepo package directories", () => {
    it("finds icon in packages/*/public directory", async () => {
      mkdirSync(join(tempDir, "packages", "app", "public"), { recursive: true });
      writeFileSync(join(tempDir, "packages", "app", "public", "favicon.ico"), "icon");

      const result = await findProjectIcon(tempDir);
      expect(result).toBe(join(tempDir, "packages", "app", "public", "favicon.ico"));
    });

    it("finds icon in apps/*/public directory", async () => {
      mkdirSync(join(tempDir, "apps", "web", "public"), { recursive: true });
      writeFileSync(join(tempDir, "apps", "web", "public", "favicon.png"), "icon");

      const result = await findProjectIcon(tempDir);
      expect(result).toBe(join(tempDir, "apps", "web", "public", "favicon.png"));
    });

    it("finds icon in packages/* root", async () => {
      mkdirSync(join(tempDir, "packages", "ui"), { recursive: true });
      writeFileSync(join(tempDir, "packages", "ui", "logo.svg"), "icon");

      const result = await findProjectIcon(tempDir);
      expect(result).toBe(join(tempDir, "packages", "ui", "logo.svg"));
    });

    it("finds icon in Phoenix app priv/static directory inside monorepo", async () => {
      mkdirSync(join(tempDir, "apps", "api", "priv", "static"), { recursive: true });
      writeFileSync(join(tempDir, "apps", "api", "priv", "static", "favicon.ico"), "icon");

      const result = await findProjectIcon(tempDir);
      expect(result).toBe(join(tempDir, "apps", "api", "priv", "static", "favicon.ico"));
    });

    it("prioritizes root priority dirs over monorepo dirs", async () => {
      mkdirSync(join(tempDir, "public"), { recursive: true });
      mkdirSync(join(tempDir, "packages", "app", "public"), { recursive: true });
      writeFileSync(join(tempDir, "public", "favicon.ico"), "root icon");
      writeFileSync(join(tempDir, "packages", "app", "public", "favicon.ico"), "package icon");

      const result = await findProjectIcon(tempDir);
      expect(result).toBe(join(tempDir, "public", "favicon.ico"));
    });

    it("prioritizes monorepo dirs over root dir (non-priority)", async () => {
      mkdirSync(join(tempDir, "packages", "app", "public"), { recursive: true });
      writeFileSync(join(tempDir, "logo.png"), "root icon");
      writeFileSync(join(tempDir, "packages", "app", "public", "favicon.ico"), "package icon");

      const result = await findProjectIcon(tempDir);
      expect(result).toBe(join(tempDir, "packages", "app", "public", "favicon.ico"));
    });
  });
});

describe("deriveProjectIconEdgeColor", () => {
  it("returns the most present visible color from the icon edge", async () => {
    const icon = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 4,
        background: "#12aabb",
      },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 8,
              height: 8,
              channels: 4,
              background: "#ff0000",
            },
          })
            .png()
            .toBuffer(),
          left: 4,
          top: 4,
        },
      ])
      .png()
      .toBuffer();

    await expect(deriveProjectIconEdgeColor(icon)).resolves.toBe("#12aabb");
  });

  it("ignores transparent edge pixels", async () => {
    const icon = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 16,
              height: 4,
              channels: 4,
              background: "#336699",
            },
          })
            .png()
            .toBuffer(),
          left: 0,
          top: 0,
        },
      ])
      .png()
      .toBuffer();

    await expect(deriveProjectIconEdgeColor(icon)).resolves.toBe("#336699");
  });
});

describe("getProjectIcon", () => {
  let tempDir: string;
  let squarePng: Buffer;
  let nonSquarePng: Buffer;

  beforeAll(async () => {
    squarePng = await createPng(128, 128);
    nonSquarePng = await createPng(200, 100);
  });

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  async function expectNormalizedPng(result: Awaited<ReturnType<typeof getProjectIcon>>) {
    expect(result).not.toBeNull();
    expect(result?.mimeType).toBe("image/png");
    const metadata = await sharp(Buffer.from(result?.data ?? "", "base64")).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(96);
    expect(metadata.height).toBe(96);
  }

  it("returns normalized icon data for square PNG", async () => {
    writeFileSync(join(tempDir, "favicon.png"), squarePng);

    const result = await getProjectIcon(tempDir);
    await expectNormalizedPng(result);
    expect(result?.path).toBe("favicon.png");
  });

  it("normalizes non-square PNG files", async () => {
    writeFileSync(join(tempDir, "favicon.png"), nonSquarePng);

    const result = await getProjectIcon(tempDir);
    await expectNormalizedPng(result);
  });

  it("returns normalized icon data for PNG-backed ICO files", async () => {
    writeFileSync(join(tempDir, "favicon.ico"), createPngBackedIco(squarePng));

    const result = await getProjectIcon(tempDir);
    await expectNormalizedPng(result);
    expect(result?.path).toBe("favicon.ico");
  });

  it("returns normalized icon data for SVG files", async () => {
    writeFileSync(
      join(tempDir, "favicon.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="red"/></svg>',
    );

    const result = await getProjectIcon(tempDir);
    await expectNormalizedPng(result);
    expect(result?.path).toBe("favicon.svg");
  });

  it("prefers the configured paseo.json icon over automatic discovery", async () => {
    mkdirSync(join(tempDir, "assets"));
    writeFileSync(join(tempDir, "favicon.png"), squarePng);
    writeFileSync(
      join(tempDir, "assets", "brand.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="32" fill="blue"/></svg>',
    );
    writeFileSync(join(tempDir, "paseo.json"), JSON.stringify({ icon: "assets/brand.svg" }));

    const result = await getProjectIcon(tempDir);
    await expectNormalizedPng(result);
    expect(result?.path).toBe("assets/brand.svg");
  });

  it("does not fall back to discovery when a configured icon is invalid", async () => {
    writeFileSync(join(tempDir, "favicon.png"), squarePng);
    writeFileSync(join(tempDir, "paseo.json"), JSON.stringify({ icon: "missing.svg" }));

    const result = await getProjectIcon(tempDir);
    expect(result).toBeNull();
  });

  it("validates an explicit relative icon path for preview requests", async () => {
    mkdirSync(join(tempDir, "assets"));
    writeFileSync(
      join(tempDir, "assets", "brand.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="32" fill="blue"/></svg>',
    );

    const result = await getProjectIcon(tempDir, { iconPath: "assets/brand.svg" });
    await expectNormalizedPng(result);
    expect(result?.path).toBe("assets/brand.svg");
  });

  it("rejects explicit icon paths that escape the project root", async () => {
    writeFileSync(join(tempDir, "favicon.png"), squarePng);

    const result = await getProjectIcon(tempDir, { iconPath: "../favicon.png" });
    expect(result).toBeNull();
  });

  it("returns null for source files over 10MB", async () => {
    const largeContent = Buffer.alloc(10 * 1024 * 1024 + 1, 0);
    writeFileSync(join(tempDir, "favicon.ico"), largeContent);

    const result = await getProjectIcon(tempDir);
    expect(result).toBeNull();
  });

  it("returns null when no icon is found", async () => {
    const result = await getProjectIcon(tempDir);
    expect(result).toBeNull();
  });
});

async function createPng(width: number, height: number): Promise<Buffer> {
  return await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 200, g: 40, b: 80, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

function createPngBackedIco(png: Buffer): Buffer {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header[6] = 128;
  header[7] = 128;
  header[8] = 0;
  header[9] = 0;
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(header.length, 18);
  return Buffer.concat([header, png]);
}

describe("normalizeProjectIconRelativePath", () => {
  it("normalizes separators and rejects absolute or escaping paths", () => {
    expect(normalizeProjectIconRelativePath("./public\\icons/../favicon.svg")).toBe(
      "public/favicon.svg",
    );
    expect(normalizeProjectIconRelativePath("/tmp/favicon.svg")).toBeNull();
    expect(normalizeProjectIconRelativePath("C:\\tmp\\favicon.svg")).toBeNull();
    expect(normalizeProjectIconRelativePath("../favicon.svg")).toBeNull();
  });
});
