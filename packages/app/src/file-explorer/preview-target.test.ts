import { describe, expect, it } from "vitest";
import { resolveFilePreviewReadTarget } from "./preview-target";

describe("resolveFilePreviewReadTarget", () => {
  it("uses the workspace cwd for relative paths", () => {
    expect(
      resolveFilePreviewReadTarget({
        path: "packages/app/src/message.tsx",
        workspaceRoot: "/Users/test/project",
      }),
    ).toEqual({
      cwd: "/Users/test/project",
      path: "packages/app/src/message.tsx",
    });
  });

  it("resolves relative paths against the markdown file directory when provided", () => {
    expect(
      resolveFilePreviewReadTarget({
        path: "01-mobile-empty-action-panel.png",
        workspaceRoot: "/Users/test/project",
        baseDirectory: "/Users/test/project/dev_data/screenshots/visual-client/action-planner",
      }),
    ).toEqual({
      cwd: "/Users/test/project",
      path: "/Users/test/project/dev_data/screenshots/visual-client/action-planner/01-mobile-empty-action-panel.png",
    });
  });

  it("normalizes dot segments when resolving relative paths against a base directory", () => {
    expect(
      resolveFilePreviewReadTarget({
        path: "../shared/output.png",
        workspaceRoot: "/Users/test/project",
        baseDirectory: "/Users/test/project/dev_data/screenshots/visual-client/action-planner",
      }),
    ).toEqual({
      cwd: "/Users/test/project",
      path: "/Users/test/project/dev_data/screenshots/visual-client/shared/output.png",
    });
  });

  it("uses the workspace cwd for absolute paths inside the workspace", () => {
    expect(
      resolveFilePreviewReadTarget({
        path: "/Users/test/project/packages/app/src/message.tsx",
        workspaceRoot: "/Users/test/project",
      }),
    ).toEqual({
      cwd: "/Users/test/project",
      path: "/Users/test/project/packages/app/src/message.tsx",
    });
  });

  it("uses the filesystem root for absolute paths outside the workspace", () => {
    expect(
      resolveFilePreviewReadTarget({
        path: "/tmp/paseo-preview.txt",
        workspaceRoot: "/Users/test/project",
      }),
    ).toEqual({
      cwd: "/",
      path: "/tmp/paseo-preview.txt",
    });
  });

  it("uses the home root for tilde paths", () => {
    expect(
      resolveFilePreviewReadTarget({
        path: "~/.paseo/plans/file-preview.md",
        workspaceRoot: "/Users/test/project",
      }),
    ).toEqual({
      cwd: "~",
      path: "~/.paseo/plans/file-preview.md",
    });
  });

  it("uses the drive root for Windows absolute paths outside the workspace", () => {
    expect(
      resolveFilePreviewReadTarget({
        path: "C:/Users/test/Desktop/file.txt",
        workspaceRoot: "D:/repo",
      }),
    ).toEqual({
      cwd: "C:/",
      path: "C:/Users/test/Desktop/file.txt",
    });
  });

  it("rejects relative paths without an absolute workspace root", () => {
    expect(resolveFilePreviewReadTarget({ path: "src/app.ts" })).toBeNull();
    expect(
      resolveFilePreviewReadTarget({
        path: "src/app.ts",
        workspaceRoot: "relative/root",
      }),
    ).toBeNull();
  });
});
