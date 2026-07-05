import { isAbsolutePath } from "@/utils/path";

export const PROJECT_ICON_FILE_EXTENSIONS = [
  "ico",
  "png",
  "svg",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "bmp",
  "tif",
  "tiff",
];

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

  const parts: string[] = [];
  for (const part of forwardSlashes.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      if (parts.length === 0) {
        return null;
      }
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  return parts.length > 0 ? parts.join("/") : null;
}

export function absolutePathForProjectIcon(projectRoot: string, relativeIconPath: string): string {
  const normalizedRelativePath = normalizeProjectIconRelativePath(relativeIconPath);
  if (!normalizedRelativePath) {
    return projectRoot;
  }

  const separator = projectRoot.includes("\\") ? "\\" : "/";
  const trimmedRoot = projectRoot.replace(/[\\/]+$/u, "");
  return `${trimmedRoot}${separator}${normalizedRelativePath.replace(/\//g, separator)}`;
}

export function relativeProjectIconPathFromAbsolute(input: {
  projectRoot: string;
  selectedPath: string;
}): string | null {
  if (!isAbsolutePath(input.projectRoot) || !isAbsolutePath(input.selectedPath)) {
    return null;
  }

  const root = normalizeAbsolutePathForComparison(input.projectRoot);
  const selected = normalizeAbsolutePathForComparison(input.selectedPath);
  const selectedPath = selected.compare;
  const rootPath = root.compare;

  if (selectedPath === rootPath || !selectedPath.startsWith(`${rootPath}/`)) {
    return null;
  }

  const relativePath = selected.display.slice(root.display.length + 1);
  return normalizeProjectIconRelativePath(relativePath);
}

function normalizeAbsolutePathForComparison(path: string): { compare: string; display: string } {
  const forwardSlashes = path.replace(/\\/g, "/").replace(/\/+$/u, "");
  const compare = /^[A-Za-z]:\//u.test(forwardSlashes)
    ? forwardSlashes.toLowerCase()
    : forwardSlashes;
  return {
    compare,
    display: forwardSlashes,
  };
}
