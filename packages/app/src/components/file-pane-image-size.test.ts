import { describe, expect, it } from "vitest";
import {
  imageExceedsViewport,
  readImagePixelSize,
  resolveImagePreviewDisplaySize,
  resolveImageZoomScrollOffset,
} from "./file-pane-image-size";

describe("readImagePixelSize", () => {
  it("returns PNG pixel dimensions from the file header", () => {
    const retinaScreenshotPng = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x03, 0x0c, 0x00, 0x00, 0x06, 0x98,
    ]);

    expect(readImagePixelSize(retinaScreenshotPng, "image/png")).toEqual({
      width: 780,
      height: 1688,
    });
  });

  it("returns null for unsupported image types", () => {
    expect(readImagePixelSize(new Uint8Array([0x00, 0x01, 0x02]), "image/svg+xml")).toBeNull();
  });

  it("caps the preview to fit within both viewport axes", () => {
    expect(
      resolveImagePreviewDisplaySize({
        imagePixelSize: { width: 1200, height: 2400 },
        availableWidth: 600,
        availableHeight: 500,
      }),
    ).toEqual({
      width: 250,
      height: 500,
    });
  });

  it("detects when true-size pixels exceed the viewport", () => {
    expect(
      imageExceedsViewport({
        imagePixelSize: { width: 780, height: 1688 },
        viewportSize: { width: 600, height: 900 },
      }),
    ).toBe(true);
    expect(
      imageExceedsViewport({
        imagePixelSize: { width: 400, height: 300 },
        viewportSize: { width: 600, height: 900 },
      }),
    ).toBe(false);
  });

  it("centers the clicked fit-view point after zooming to true size", () => {
    expect(
      resolveImageZoomScrollOffset({
        clickX: 150,
        clickY: 250,
        fitSize: { width: 300, height: 500 },
        trueSize: { width: 600, height: 1000 },
        viewportSize: { width: 200, height: 300 },
      }),
    ).toEqual({
      x: 200,
      y: 350,
    });
  });
});
