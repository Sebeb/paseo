import { describe, expect, it } from "vitest";
import {
  absolutePathForProjectIcon,
  normalizeProjectIconRelativePath,
  relativeProjectIconPathFromAbsolute,
} from "./project-icon-path";

describe("normalizeProjectIconRelativePath", () => {
  it("normalizes separators and dot segments", () => {
    expect(normalizeProjectIconRelativePath("./public\\icons/../favicon.svg")).toBe(
      "public/favicon.svg",
    );
  });

  it("rejects absolute and escaping paths", () => {
    expect(normalizeProjectIconRelativePath("/tmp/icon.svg")).toBeNull();
    expect(normalizeProjectIconRelativePath("C:\\tmp\\icon.svg")).toBeNull();
    expect(normalizeProjectIconRelativePath("../icon.svg")).toBeNull();
  });
});

describe("relativeProjectIconPathFromAbsolute", () => {
  it("returns a portable relative path for an in-project selection", () => {
    expect(
      relativeProjectIconPathFromAbsolute({
        projectRoot: "/Users/me/project",
        selectedPath: "/Users/me/project/public/favicon.svg",
      }),
    ).toBe("public/favicon.svg");
  });

  it("rejects a sibling path with the same prefix", () => {
    expect(
      relativeProjectIconPathFromAbsolute({
        projectRoot: "/Users/me/project",
        selectedPath: "/Users/me/project-copy/favicon.svg",
      }),
    ).toBeNull();
  });

  it("compares Windows drive paths case-insensitively", () => {
    expect(
      relativeProjectIconPathFromAbsolute({
        projectRoot: "C:\\Users\\me\\Project",
        selectedPath: "c:\\users\\me\\project\\assets\\icon.png",
      }),
    ).toBe("assets/icon.png");
  });
});

describe("absolutePathForProjectIcon", () => {
  it("joins a project root and stored icon path", () => {
    expect(absolutePathForProjectIcon("/Users/me/project", "public/favicon.svg")).toBe(
      "/Users/me/project/public/favicon.svg",
    );
  });
});
