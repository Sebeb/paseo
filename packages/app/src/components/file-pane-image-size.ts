export interface ImagePixelSize {
  width: number;
  height: number;
}

export interface ImageZoomScrollOffset {
  x: number;
  y: number;
}

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function hasBytes(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  if (offset < 0 || offset + expected.length > bytes.length) {
    return false;
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[offset + index] !== expected[index]) {
      return false;
    }
  }
  return true;
}

function getView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function readPngSize(bytes: Uint8Array): ImagePixelSize | null {
  if (!hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) || bytes.length < 24) {
    return null;
  }
  const view = getView(bytes);
  return {
    width: view.getUint32(16, false),
    height: view.getUint32(20, false),
  };
}

function readJpegSize(bytes: Uint8Array): ImagePixelSize | null {
  if (!hasBytes(bytes, 0, [0xff, 0xd8])) {
    return null;
  }

  const view = getView(bytes);
  let offset = 2;
  while (offset + 9 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    if (marker == null) {
      return null;
    }

    if (
      marker === 0xd8 ||
      marker === 0xd9 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      offset += 2;
      continue;
    }

    if (offset + 4 > bytes.length) {
      return null;
    }

    const segmentLength = view.getUint16(offset + 2, false);
    if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) {
      return null;
    }

    if (JPEG_SOF_MARKERS.has(marker)) {
      return {
        height: view.getUint16(offset + 5, false),
        width: view.getUint16(offset + 7, false),
      };
    }

    offset += 2 + segmentLength;
  }

  return null;
}

function readGifSize(bytes: Uint8Array): ImagePixelSize | null {
  if (
    bytes.length < 10 ||
    (!hasBytes(bytes, 0, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) &&
      !hasBytes(bytes, 0, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))
  ) {
    return null;
  }
  const view = getView(bytes);
  return {
    width: view.getUint16(6, true),
    height: view.getUint16(8, true),
  };
}

function readUint24LE(bytes: Uint8Array, offset: number): number | null {
  const a = bytes[offset];
  const b = bytes[offset + 1];
  const c = bytes[offset + 2];
  if (a == null || b == null || c == null) {
    return null;
  }
  return a | (b << 8) | (c << 16);
}

function readWebpSize(bytes: Uint8Array): ImagePixelSize | null {
  if (
    bytes.length < 30 ||
    !hasBytes(bytes, 0, [0x52, 0x49, 0x46, 0x46]) ||
    !hasBytes(bytes, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return null;
  }

  const view = getView(bytes);
  if (hasBytes(bytes, 12, [0x56, 0x50, 0x38, 0x58])) {
    const widthMinusOne = readUint24LE(bytes, 24);
    const heightMinusOne = readUint24LE(bytes, 27);
    if (widthMinusOne == null || heightMinusOne == null) {
      return null;
    }
    return {
      width: widthMinusOne + 1,
      height: heightMinusOne + 1,
    };
  }

  if (hasBytes(bytes, 12, [0x56, 0x50, 0x38, 0x4c])) {
    const bits = view.getUint32(21, true);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  if (hasBytes(bytes, 12, [0x56, 0x50, 0x38, 0x20]) && hasBytes(bytes, 23, [0x9d, 0x01, 0x2a])) {
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }

  return null;
}

export function readImagePixelSize(bytes: Uint8Array, mimeType: string): ImagePixelSize | null {
  switch (mimeType) {
    case "image/png":
      return readPngSize(bytes);
    case "image/jpeg":
      return readJpegSize(bytes);
    case "image/gif":
      return readGifSize(bytes);
    case "image/webp":
      return readWebpSize(bytes);
    default:
      return null;
  }
}

export function resolveImagePreviewDisplaySize(input: {
  imagePixelSize: ImagePixelSize;
  availableWidth: number;
  availableHeight: number;
}): ImagePixelSize {
  const scale = Math.min(
    1,
    input.availableWidth / input.imagePixelSize.width,
    input.availableHeight / input.imagePixelSize.height,
  );
  return {
    width: Math.max(1, Math.round(input.imagePixelSize.width * scale)),
    height: Math.max(1, Math.round(input.imagePixelSize.height * scale)),
  };
}

export function imageExceedsViewport(input: {
  imagePixelSize: ImagePixelSize;
  viewportSize: ImagePixelSize;
}): boolean {
  return (
    input.imagePixelSize.width > input.viewportSize.width ||
    input.imagePixelSize.height > input.viewportSize.height
  );
}

function clampOffset(offset: number, maxOffset: number): number {
  return Math.min(Math.max(0, offset), Math.max(0, maxOffset));
}

export function resolveImageZoomScrollOffset(input: {
  clickX: number;
  clickY: number;
  fitSize: ImagePixelSize;
  trueSize: ImagePixelSize;
  viewportSize: ImagePixelSize;
}): ImageZoomScrollOffset {
  const scaleX = input.trueSize.width / input.fitSize.width;
  const scaleY = input.trueSize.height / input.fitSize.height;
  const truePixelX = input.clickX * scaleX;
  const truePixelY = input.clickY * scaleY;
  return {
    x: clampOffset(
      truePixelX - input.viewportSize.width / 2,
      input.trueSize.width - input.viewportSize.width,
    ),
    y: clampOffset(
      truePixelY - input.viewportSize.height / 2,
      input.trueSize.height - input.viewportSize.height,
    ),
  };
}
