import { readdir, readFile, stat } from "fs/promises";
import { extname, join, posix, relative, resolve } from "path";
import { PaseoConfigRawSchema } from "@getpaseo/protocol/paseo-config-schema";
import sharp from "sharp";
import { readPaseoConfigJson } from "./paseo-config-file.js";
import { isPathInsideRoot } from "./path.js";

/**
 * Icon file patterns to search for, in priority order.
 * Patterns starting with '*' are glob patterns (e.g., icon-*.png).
 */
export const ICON_PATTERNS = [
  "favicon.ico",
  "favicon.png",
  "favicon.svg",
  "favico.ico",
  "favico.png",
  "favico.svg",
  "icon.png",
  "icon.svg",
  "app-icon.png",
  "app-icon.svg",
  "apple-touch-icon.png",
  "icon-*.png",
  "logo.png",
  "logo.svg",
];

/**
 * Directories or directory paths to search first (in priority order).
 */
export const PRIORITY_DIRS = ["public", "static", "priv/static", "assets", "images", "img"];

/**
 * Monorepo package directory patterns to scan (e.g., packages/app, apps/web).
 */
export const MONOREPO_PACKAGE_DIRS = ["packages", "apps"];

/**
 * Directories to ignore during search.
 */
export const IGNORED_DIRS = [
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".output",
  "coverage",
  ".cache",
  "vendor",
  "src",
  "lib",
  "test",
  "tests",
  "__tests__",
];

export interface ProjectIcon {
  data: string;
  mimeType: string;
  path?: string;
}

const MAX_SOURCE_ICON_SIZE = 10 * 1024 * 1024;
const NORMALIZED_ICON_SIZE = 96;
const MAX_ICON_CACHE_ENTRIES = 256;
const PROJECT_ICON_OUTPUT_MIME_TYPE = "image/png";
const projectIconCache = new Map<string, ProjectIcon>();

export interface GetProjectIconOptions {
  iconPath?: string;
}

interface ProjectIconCandidate {
  fullPath: string;
  relativePath: string;
}

function getSourceMimeType(filename: string): string | null {
  const ext = extname(filename).toLowerCase();
  switch (ext) {
    case ".ico":
      return "image/x-icon";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".avif":
      return "image/avif";
    case ".bmp":
      return "image/bmp";
    case ".tif":
    case ".tiff":
      return "image/tiff";
    default:
      return null;
  }
}

function extractPngFromIco(buffer: Buffer): Buffer | null {
  if (buffer.length < 22) {
    return null;
  }
  const reserved = buffer.readUInt16LE(0);
  const type = buffer.readUInt16LE(2);
  const count = buffer.readUInt16LE(4);
  if (reserved !== 0 || (type !== 1 && type !== 2) || count < 1) {
    return null;
  }

  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let selected: { buffer: Buffer; score: number } | null = null;
  for (let index = 0; index < count; index++) {
    const entryOffset = 6 + index * 16;
    if (entryOffset + 16 > buffer.length) {
      return null;
    }

    const width = buffer[entryOffset] === 0 ? 256 : (buffer[entryOffset] ?? 0);
    const height = buffer[entryOffset + 1] === 0 ? 256 : (buffer[entryOffset + 1] ?? 0);
    const bitCount = buffer.readUInt16LE(entryOffset + 6);
    const bytesInResource = buffer.readUInt32LE(entryOffset + 8);
    const imageOffset = buffer.readUInt32LE(entryOffset + 12);
    if (
      bytesInResource === 0 ||
      imageOffset + bytesInResource > buffer.length ||
      imageOffset < 6 + count * 16
    ) {
      continue;
    }

    const imageBuffer = buffer.subarray(imageOffset, imageOffset + bytesInResource);
    if (!imageBuffer.subarray(0, pngSignature.length).equals(pngSignature)) {
      continue;
    }

    const score = width * height * Math.max(bitCount, 1);
    if (!selected || score > selected.score) {
      selected = { buffer: imageBuffer, score };
    }
  }

  return selected?.buffer ?? null;
}

async function normalizeIconBuffer(sourceBuffer: Buffer, sourceMimeType: string): Promise<Buffer> {
  const inputBuffer =
    sourceMimeType === "image/x-icon"
      ? (extractPngFromIco(sourceBuffer) ?? sourceBuffer)
      : sourceBuffer;

  return await sharp(inputBuffer, { animated: false, limitInputPixels: 128_000_000 })
    .resize(NORMALIZED_ICON_SIZE, NORMALIZED_ICON_SIZE, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

function getProjectIconCacheKey(
  candidate: ProjectIconCandidate,
  stats: { mtimeMs: number; size: number },
): string {
  return `${candidate.fullPath}:${stats.mtimeMs}:${stats.size}:${candidate.relativePath}`;
}

function readCachedProjectIcon(cacheKey: string): ProjectIcon | null {
  const cached = projectIconCache.get(cacheKey);
  if (!cached) {
    return null;
  }
  projectIconCache.delete(cacheKey);
  projectIconCache.set(cacheKey, cached);
  return cached;
}

function writeCachedProjectIcon(cacheKey: string, icon: ProjectIcon): void {
  projectIconCache.set(cacheKey, icon);
  if (projectIconCache.size <= MAX_ICON_CACHE_ENTRIES) {
    return;
  }
  const oldestKey = projectIconCache.keys().next().value;
  if (oldestKey) {
    projectIconCache.delete(oldestKey);
  }
}

export function normalizeProjectIconRelativePath(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const forwardSlashes = trimmed.replace(/\\/g, "/");
  if (
    forwardSlashes.startsWith("/") ||
    forwardSlashes.startsWith("//") ||
    /^[A-Za-z]:\//u.test(forwardSlashes)
  ) {
    return null;
  }

  const normalized = posix.normalize(forwardSlashes);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    return null;
  }
  return normalized;
}

function toProjectRelativePath(projectDir: string, iconPath: string): string | null {
  const normalizedRoot = resolve(projectDir);
  const normalizedIconPath = resolve(iconPath);
  if (!isPathInsideRoot(normalizedRoot, normalizedIconPath)) {
    return null;
  }

  const relativePath = relative(normalizedRoot, normalizedIconPath).replace(/\\/g, "/");
  return normalizeProjectIconRelativePath(relativePath);
}

function resolveProjectIconCandidate(
  projectDir: string,
  relativePath: string,
): ProjectIconCandidate | null {
  const normalizedRelativePath = normalizeProjectIconRelativePath(relativePath);
  if (!normalizedRelativePath) {
    return null;
  }

  const normalizedRoot = resolve(projectDir);
  const fullPath = resolve(normalizedRoot, ...normalizedRelativePath.split("/"));
  if (!isPathInsideRoot(normalizedRoot, fullPath)) {
    return null;
  }

  return {
    fullPath,
    relativePath: normalizedRelativePath,
  };
}

function readConfiguredProjectIconPath(projectDir: string): string | null {
  try {
    const parsed = PaseoConfigRawSchema.safeParse(readPaseoConfigJson(projectDir));
    if (!parsed.success) {
      return null;
    }
    return parsed.data.icon ?? null;
  } catch {
    return null;
  }
}

function matchesPattern(filename: string, pattern: string): boolean {
  if (pattern.includes("*")) {
    // Convert glob pattern to regex
    const regexPattern = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*");
    return new RegExp(`^${regexPattern}$`).test(filename);
  }
  return filename === pattern;
}

async function isExistingFile(fullPath: string): Promise<boolean> {
  try {
    const stats = await stat(fullPath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function isExistingDirectory(fullPath: string): Promise<boolean> {
  try {
    const stats = await stat(fullPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function findIconInDir(dir: string, patterns: string[]): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }

  // Collect candidate paths in priority order (pattern, then entry)
  const candidatePaths: string[] = [];
  for (const pattern of patterns) {
    for (const entry of entries) {
      if (matchesPattern(entry, pattern)) {
        candidatePaths.push(join(dir, entry));
      }
    }
  }

  const existsResults = await Promise.all(candidatePaths.map((p) => isExistingFile(p)));
  const foundIndex = existsResults.findIndex((exists) => exists);
  return foundIndex === -1 ? null : (candidatePaths[foundIndex] ?? null);
}

async function searchPriorityDirs(
  basePath: string,
  ignoredDirsSet: Set<string>,
  remainingDepth: number,
): Promise<string | null> {
  const priorityPaths = PRIORITY_DIRS.map((priorityDir) => join(basePath, priorityDir));
  const existenceResults = await Promise.all(
    priorityPaths.map((priorityPath) => isExistingDirectory(priorityPath)),
  );
  const searchResults = await Promise.all(
    priorityPaths.map((priorityPath, index) =>
      existenceResults[index]
        ? searchDirRecursively(priorityPath, ICON_PATTERNS, ignoredDirsSet, remainingDepth)
        : Promise.resolve(null),
    ),
  );
  return searchResults.find((result): result is string => result !== null) ?? null;
}

async function searchDirRecursively(
  dir: string,
  patterns: string[],
  ignoredDirs: Set<string>,
  maxDepth: number,
  currentDepth: number = 0,
): Promise<string | null> {
  if (currentDepth > maxDepth) {
    return null;
  }

  // First check this directory for icons
  const found = await findIconInDir(dir, patterns);
  if (found) {
    return found;
  }

  // Then recurse into subdirectories
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }

  const candidatePaths = entries
    .filter((entry) => !ignoredDirs.has(entry))
    .map((entry) => join(dir, entry));
  const isDirResults = await Promise.all(
    candidatePaths.map((fullPath) => isExistingDirectory(fullPath)),
  );
  const recursionResults = await Promise.all(
    candidatePaths.map((fullPath, index) =>
      isDirResults[index]
        ? searchDirRecursively(fullPath, patterns, ignoredDirs, maxDepth, currentDepth + 1)
        : Promise.resolve(null),
    ),
  );
  return recursionResults.find((result): result is string => result !== null) ?? null;
}

/**
 * Find a project icon/favicon in the given directory.
 * Searches priority directories first, then falls back to scanning the root.
 *
 * @param projectDir - The root directory of the project to search
 * @param maxDepth - Maximum depth to search (default: 3)
 * @returns The absolute path to the found icon, or null if not found
 */
export async function findProjectIcon(
  projectDir: string,
  maxDepth: number = 3,
): Promise<string | null> {
  const ignoredDirsSet = new Set(IGNORED_DIRS);

  // First search priority directories
  const priorityResult = await searchPriorityDirs(projectDir, ignoredDirsSet, maxDepth - 1);
  if (priorityResult) {
    return priorityResult;
  }

  // Then search monorepo package directories (packages/*, apps/*)
  const monoPaths = MONOREPO_PACKAGE_DIRS.map((monoDir) => join(projectDir, monoDir));
  const monoEntries = await Promise.all(
    monoPaths.map(async (monoPath): Promise<string[] | null> => {
      try {
        return await readdir(monoPath);
      } catch {
        return null;
      }
    }),
  );
  const monoResults = await Promise.all(
    monoPaths.map(async (monoPath, monoIdx): Promise<string | null> => {
      const packageEntries = monoEntries[monoIdx];
      if (!packageEntries) return null;
      const packagePaths = packageEntries.map((packageName) => join(monoPath, packageName));
      const isDirResults = await Promise.all(
        packagePaths.map((packagePath) => isExistingDirectory(packagePath)),
      );
      const packageResults = await Promise.all(
        packagePaths.map(async (packagePath, idx): Promise<string | null> => {
          if (!isDirResults[idx]) return null;
          const packagePriorityResult = await searchPriorityDirs(
            packagePath,
            ignoredDirsSet,
            maxDepth - 1,
          );
          if (packagePriorityResult) return packagePriorityResult;
          return await findIconInDir(packagePath, ICON_PATTERNS);
        }),
      );
      return packageResults.find((result): result is string => result !== null) ?? null;
    }),
  );
  const monoMatch = monoResults.find((result): result is string => result !== null);
  if (monoMatch) {
    return monoMatch;
  }

  // Then search root and any other non-priority directories
  const found = await findDirRecursively(projectDir);
  if (found) {
    return found;
  }

  return null;
}

async function findDirRecursively(
  dir: string,
  maxDepth: number = 2,
  currentDepth: number = 0,
): Promise<string | null> {
  const ignoredDirsSet = new Set(IGNORED_DIRS);
  const priorityDirsSet = new Set(PRIORITY_DIRS);

  if (currentDepth > maxDepth) {
    return null;
  }

  // Check root for icons
  const found = await findIconInDir(dir, ICON_PATTERNS);
  if (found) {
    return found;
  }

  // Don't recurse further from root - we already searched priority dirs
  if (currentDepth === 0) {
    return null;
  }

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }

  const candidatePaths = entries
    .filter((entry) => !ignoredDirsSet.has(entry) && !priorityDirsSet.has(entry))
    .map((entry) => join(dir, entry));
  const isDirResults = await Promise.all(
    candidatePaths.map((fullPath) => isExistingDirectory(fullPath)),
  );
  const recursionResults = await Promise.all(
    candidatePaths.map((fullPath, index) =>
      isDirResults[index]
        ? findDirRecursively(fullPath, maxDepth, currentDepth + 1)
        : Promise.resolve(null),
    ),
  );
  return recursionResults.find((result): result is string => result !== null) ?? null;
}

/**
 * Find, normalize, and read a project icon/favicon, returning it as base64 PNG data.
 *
 * @param projectDir - The root directory of the project to search
 * @returns The icon data with mime type, or null if not found
 */
export async function getProjectIcon(
  projectDir: string,
  options: GetProjectIconOptions = {},
): Promise<ProjectIcon | null> {
  const configuredPath = options.iconPath ?? readConfiguredProjectIconPath(projectDir);
  const candidate =
    configuredPath !== null && configuredPath !== undefined
      ? resolveProjectIconCandidate(projectDir, configuredPath)
      : await findProjectIconCandidate(projectDir);
  if (!candidate) {
    return null;
  }

  try {
    const stats = await stat(candidate.fullPath);
    if (stats.size > MAX_SOURCE_ICON_SIZE) {
      return null;
    }

    const sourceMimeType = getSourceMimeType(candidate.fullPath);
    if (!sourceMimeType) {
      return null;
    }

    const cacheKey = getProjectIconCacheKey(candidate, stats);
    const cachedIcon = readCachedProjectIcon(cacheKey);
    if (cachedIcon) {
      return cachedIcon;
    }

    const buffer = await readFile(candidate.fullPath);
    const normalizedBuffer = await normalizeIconBuffer(buffer, sourceMimeType);
    const icon = {
      data: normalizedBuffer.toString("base64"),
      mimeType: PROJECT_ICON_OUTPUT_MIME_TYPE,
      path: candidate.relativePath,
    };
    writeCachedProjectIcon(cacheKey, icon);
    return icon;
  } catch {
    return null;
  }
}

async function findProjectIconCandidate(projectDir: string): Promise<ProjectIconCandidate | null> {
  const iconPath = await findProjectIcon(projectDir);
  if (!iconPath) {
    return null;
  }
  const relativePath = toProjectRelativePath(projectDir, iconPath);
  if (!relativePath) {
    return null;
  }
  return { fullPath: iconPath, relativePath };
}
