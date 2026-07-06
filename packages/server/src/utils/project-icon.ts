import { readdir, readFile, stat } from "fs/promises";
import { extname, join } from "path";
import { inflateSync } from "zlib";

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
  backgroundColor?: string;
}

const MAX_ICON_SIZE = 2 * 1024 * 1024; // 2MB max
const MAX_ICON_PIXELS = 2048 * 2048;

interface ImageDimensions {
  width: number;
  height: number;
}

interface PngImage {
  width: number;
  height: number;
  data: Buffer;
}

interface PngPaletteTransparency {
  palette: number[];
  alpha: number[];
}

interface PngPayload {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
  idatChunks: Buffer[];
  paletteTransparency: PngPaletteTransparency | null;
}

interface ColorBucket {
  weight: number;
  red: number;
  green: number;
  blue: number;
}

function getPngDimensions(buffer: Buffer): ImageDimensions | null {
  // PNG header: 89 50 4E 47 0D 0A 1A 0A
  if (buffer.length < 24) return null;
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) {
    return null;
  }
  // Width and height are at bytes 16-19 and 20-23 (big endian)
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

function getJpegDimensions(buffer: Buffer): ImageDimensions | null {
  // JPEG starts with FF D8 FF
  if (buffer.length < 4) return null;
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  while (offset < buffer.length - 8) {
    if (buffer[offset] !== 0xff) {
      offset++;
      continue;
    }

    const marker = buffer[offset + 1];
    // SOF0-SOF2 markers contain dimensions
    if (marker >= 0xc0 && marker <= 0xc2) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return { width, height };
    }

    // Skip to next marker
    const length = buffer.readUInt16BE(offset + 2);
    offset += 2 + length;
  }
  return null;
}

function getGifDimensions(buffer: Buffer): ImageDimensions | null {
  // GIF header: GIF87a or GIF89a
  if (buffer.length < 10) return null;
  if (buffer[0] !== 0x47 || buffer[1] !== 0x49 || buffer[2] !== 0x46) return null;
  // Width and height at bytes 6-7 and 8-9 (little endian)
  const width = buffer.readUInt16LE(6);
  const height = buffer.readUInt16LE(8);
  return { width, height };
}

function getWebpDimensions(buffer: Buffer): ImageDimensions | null {
  // WEBP: RIFF....WEBP
  if (buffer.length < 30) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF") return null;
  if (buffer.toString("ascii", 8, 12) !== "WEBP") return null;

  const chunkType = buffer.toString("ascii", 12, 16);
  if (chunkType === "VP8 ") {
    // Lossy format - dimensions at offset 26-27 and 28-29
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return { width, height };
  } else if (chunkType === "VP8L") {
    // Lossless format
    const bits = buffer.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { width, height };
  }
  return null;
}

function getImageDimensions(buffer: Buffer, mimeType: string): ImageDimensions | null {
  switch (mimeType) {
    case "image/png":
      return getPngDimensions(buffer);
    case "image/jpeg":
      return getJpegDimensions(buffer);
    case "image/gif":
      return getGifDimensions(buffer);
    case "image/webp":
      return getWebpDimensions(buffer);
    case "image/x-icon":
      // ICO files are typically square, trust them
      return { width: 1, height: 1 };
    case "image/svg+xml":
      // SVG can be any aspect ratio but icons are typically square, trust them
      return { width: 1, height: 1 };
    default:
      return null;
  }
}

function paethPredictor(left: number, up: number, upperLeft: number): number {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) {
    return left;
  }
  return upDistance <= upperLeftDistance ? up : upperLeft;
}

function unfilterPngScanlines(input: Buffer, width: number, height: number, bytesPerPixel: number) {
  const stride = width * bytesPerPixel;
  const expectedLength = height * (stride + 1);
  if (input.length < expectedLength) {
    return null;
  }

  const output = Buffer.alloc(stride * height);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = input[inputOffset];
    inputOffset += 1;
    const rawRow = input.subarray(inputOffset, inputOffset + stride);
    inputOffset += stride;
    const outputRow = output.subarray(y * stride, (y + 1) * stride);
    const previousRow = y > 0 ? output.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? outputRow[x - bytesPerPixel] : 0;
      const up = previousRow ? previousRow[x] : 0;
      const upperLeft = previousRow && x >= bytesPerPixel ? previousRow[x - bytesPerPixel] : 0;
      let predictor = 0;
      if (filter === 1) {
        predictor = left;
      } else if (filter === 2) {
        predictor = up;
      } else if (filter === 3) {
        predictor = Math.floor((left + up) / 2);
      } else if (filter === 4) {
        predictor = paethPredictor(left, up, upperLeft);
      } else if (filter !== 0) {
        return null;
      }
      outputRow[x] = (rawRow[x] + predictor) & 0xff;
    }
  }
  return output;
}

function readPngPayload(buffer: Buffer): PngPayload | null {
  if (buffer.length < 33) return null;
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) {
    return null;
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatChunks: Buffer[] = [];
  let paletteTransparency: PngPaletteTransparency | null = null;

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) {
      return null;
    }
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? 0;
      interlace = data[12] ?? 0;
    } else if (type === "PLTE") {
      paletteTransparency = { palette: Array.from(data), alpha: [] };
    } else if (type === "tRNS" && paletteTransparency) {
      paletteTransparency.alpha = Array.from(data);
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }

  return {
    width,
    height,
    bitDepth,
    colorType,
    interlace,
    idatChunks,
    paletteTransparency,
  };
}

function getPngBytesPerPixel(colorType: number): number | null {
  if (colorType === 2) return 3;
  if (colorType === 6) return 4;
  if (colorType === 3) return 1;
  return null;
}

function writePngRgbPixel(
  input: Buffer,
  inputOffset: number,
  output: Buffer,
  outputOffset: number,
) {
  output[outputOffset] = input[inputOffset];
  output[outputOffset + 1] = input[inputOffset + 1];
  output[outputOffset + 2] = input[inputOffset + 2];
  output[outputOffset + 3] = 255;
}

function writePngRgbaPixel(
  input: Buffer,
  inputOffset: number,
  output: Buffer,
  outputOffset: number,
) {
  output[outputOffset] = input[inputOffset];
  output[outputOffset + 1] = input[inputOffset + 1];
  output[outputOffset + 2] = input[inputOffset + 2];
  output[outputOffset + 3] = input[inputOffset + 3];
}

function writePngPalettePixel(
  input: Buffer,
  inputOffset: number,
  output: Buffer,
  outputOffset: number,
  paletteTransparency: PngPaletteTransparency,
) {
  const paletteIndex = input[inputOffset] ?? 0;
  const paletteOffset = paletteIndex * 3;
  output[outputOffset] = paletteTransparency.palette[paletteOffset] ?? 0;
  output[outputOffset + 1] = paletteTransparency.palette[paletteOffset + 1] ?? 0;
  output[outputOffset + 2] = paletteTransparency.palette[paletteOffset + 2] ?? 0;
  output[outputOffset + 3] = paletteTransparency.alpha[paletteIndex] ?? 255;
}

function convertPngScanlinesToRgba(
  input: Buffer,
  width: number,
  height: number,
  bytesPerPixel: number,
  colorType: number,
  paletteTransparency: PngPaletteTransparency | null,
): Buffer | null {
  if (colorType === 3 && !paletteTransparency) {
    return null;
  }

  const rgba = Buffer.alloc(width * height * 4);
  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    const sourceOffset = pixelIndex * bytesPerPixel;
    const targetOffset = pixelIndex * 4;
    if (colorType === 2) {
      writePngRgbPixel(input, sourceOffset, rgba, targetOffset);
    } else if (colorType === 6) {
      writePngRgbaPixel(input, sourceOffset, rgba, targetOffset);
    } else if (paletteTransparency) {
      writePngPalettePixel(input, sourceOffset, rgba, targetOffset, paletteTransparency);
    }
  }
  return rgba;
}

function readPngAsRgba(buffer: Buffer): PngImage | null {
  const payload = readPngPayload(buffer);
  if (!payload) {
    return null;
  }

  const { width, height, bitDepth, colorType, interlace, idatChunks, paletteTransparency } =
    payload;
  if (width <= 0 || height <= 0 || bitDepth !== 8 || interlace !== 0 || idatChunks.length === 0) {
    return null;
  }

  const bytesPerPixel = getPngBytesPerPixel(colorType);
  if (!bytesPerPixel) {
    return null;
  }

  let scanlines: Buffer;
  try {
    scanlines = inflateSync(Buffer.concat(idatChunks));
  } catch {
    return null;
  }

  const unfiltered = unfilterPngScanlines(scanlines, width, height, bytesPerPixel);
  if (!unfiltered) {
    return null;
  }

  const data = convertPngScanlinesToRgba(
    unfiltered,
    width,
    height,
    bytesPerPixel,
    colorType,
    paletteTransparency,
  );
  if (!data) {
    return null;
  }

  return { width, height, data };
}

function toHexChannel(value: number): string {
  return Math.round(Math.max(0, Math.min(255, value)))
    .toString(16)
    .padStart(2, "0");
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`;
}

function extractOpaqueBounds(image: PngImage):
  | (ImageDimensions & {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    })
  | null {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const alpha = image.data[(y * image.width + x) * 4 + 3] ?? 0;
      if (alpha < 64) {
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function pickDominantEdgeColor(image: PngImage): string | null {
  const bounds = extractOpaqueBounds(image);
  if (!bounds) {
    return null;
  }

  const edgeWidth = Math.max(1, Math.floor(bounds.width * 0.12));
  const edgeHeight = Math.max(1, Math.floor(bounds.height * 0.12));
  const buckets = new Map<string, ColorBucket>();

  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const inEdgeBand =
        x < bounds.minX + edgeWidth ||
        x > bounds.maxX - edgeWidth ||
        y < bounds.minY + edgeHeight ||
        y > bounds.maxY - edgeHeight;
      if (!inEdgeBand) {
        continue;
      }

      const offset = (y * image.width + x) * 4;
      const alpha = image.data[offset + 3] ?? 0;
      if (alpha < 64) {
        continue;
      }

      const red = image.data[offset] ?? 0;
      const green = image.data[offset + 1] ?? 0;
      const blue = image.data[offset + 2] ?? 0;
      const bucketKey = `${red >> 4}:${green >> 4}:${blue >> 4}`;
      const bucket = buckets.get(bucketKey) ?? { weight: 0, red: 0, green: 0, blue: 0 };
      const weight = alpha / 255;
      bucket.weight += weight;
      bucket.red += red * weight;
      bucket.green += green * weight;
      bucket.blue += blue * weight;
      buckets.set(bucketKey, bucket);
    }
  }

  let selected: ColorBucket | null = null;
  for (const bucket of Array.from(buckets.values())) {
    if (!selected || bucket.weight > selected.weight) {
      selected = bucket;
    }
  }
  if (!selected || selected.weight <= 0) {
    return null;
  }
  return rgbToHex(
    selected.red / selected.weight,
    selected.green / selected.weight,
    selected.blue / selected.weight,
  );
}

function extractProjectIconBackgroundColor(buffer: Buffer, mimeType: string): string | null {
  if (mimeType !== "image/png") {
    return null;
  }
  const image = readPngAsRgba(buffer);
  return image ? pickDominantEdgeColor(image) : null;
}

function getMimeType(filename: string): string {
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
    default:
      return "application/octet-stream";
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
 * Find and read a project icon/favicon, returning it as base64.
 * Only returns square icons smaller than MAX_ICON_SIZE.
 *
 * @param projectDir - The root directory of the project to search
 * @returns The icon data with mime type, or null if not found
 */
export async function getProjectIcon(projectDir: string): Promise<ProjectIcon | null> {
  const iconPath = await findProjectIcon(projectDir);
  if (!iconPath) {
    return null;
  }

  try {
    const stats = await stat(iconPath);
    if (stats.size > MAX_ICON_SIZE) {
      return null;
    }

    const buffer = await readFile(iconPath);
    const mimeType = getMimeType(iconPath);

    const dimensions = getImageDimensions(buffer, mimeType);
    if (
      !dimensions ||
      dimensions.width !== dimensions.height ||
      dimensions.width * dimensions.height > MAX_ICON_PIXELS
    ) {
      return null;
    }

    const data = buffer.toString("base64");
    const backgroundColor = extractProjectIconBackgroundColor(buffer, mimeType);
    return backgroundColor ? { data, mimeType, backgroundColor } : { data, mimeType };
  } catch {
    return null;
  }
}
