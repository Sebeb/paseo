# Patch Summary: Markdown Image Rendering

Branch: `feat/markdown-image-rendering`

Base: `origin/main`

Anchor commit: 2ac7f40bb6ca121b1d74b7739de6dbcd3d95bdae — feat(app): render markdown image previews

## Purpose

This branch improves file previews so Markdown image references render in the preview pane and image files use true pixel dimensions for fit/zoom behavior. It also makes assistant file links more tolerant of percent-escaped local paths and Godot `.gd` files.

## User-Facing Changes

- Markdown previews render image references instead of leaving them as unresolved markdown image syntax.
- Relative Markdown image paths resolve against the Markdown file's directory before falling back to the workspace root.
- Data URL images in Markdown previews are persisted and rendered through the attachment preview path.
- File image previews fit to the available viewport, then allow click-to-zoom to true pixel size when the image is larger than the viewport.
- Percent-escaped local paths such as `Ad%20Inf%20Godot/file.gd:37` resolve correctly.
- `.gd` files are recognized by assistant file-link parsing.

## Implementation Details

### `packages/app/src/components/file-pane.tsx`

`createFilePanePreview` now returns `imagePixelSize` in addition to the explorer file and optional preview attachment. For image file reads, it calls `readImagePixelSize(file.bytes, file.mime)` so display sizing uses file header dimensions instead of browser-reported CSS dimensions.

`FilePreviewBody` receives `serverId`, `client`, `workspaceRoot`, and `imagePixelSize`. For rendered Markdown files it builds custom markdown rules with `createSharedMarkdownRules()` and overrides the `image` rule to render `FilePreviewMarkdownImage`.

`FilePreviewMarkdownImage` resolves each image source through `useMarkdownPreviewImageSource`:

- Local file paths use `resolveAssistantImageSource({ source, workspaceRoot, baseDirectory })`.
- `file_rpc` sources call `client.readFile(cwd, path)`, require `file.kind === "image"`, persist bytes with `persistAttachmentFromBytes`, and render the attachment preview URL.
- Data URLs are parsed with `parseImageDataUrl`, persisted with `persistAttachmentFromDataUrl`, and rendered through the attachment preview URL.
- Direct `http`, `https`, `data`, and `file` style sources render directly when appropriate.

`getParentDirectory(path)` derives the Markdown file directory from the resolved file path, preserving POSIX root and Windows drive roots.

`ImageFilePreview` owns image-file fit/zoom rendering:

- Measures the viewport with `onLayout`.
- Uses `resolveImagePreviewDisplaySize` for fit-to-viewport dimensions.
- Enables zoom only when `imageExceedsViewport` is true.
- Click/tap toggles between fit size and true pixel size.
- When zooming in, `resolveImageZoomScrollOffset` keeps the clicked fit-view point centered where possible.
- Uses nested horizontal and vertical `ScrollView`s for true-size overflow.
- On web, wraps the image in a `div` with `zoom-in` / `zoom-out` cursor when zoom is available.

### `packages/app/src/components/file-pane-image-size.ts`

New helper module.

Exports:

```ts
export interface ImagePixelSize {
  width: number;
  height: number;
}

export interface ImageZoomScrollOffset {
  x: number;
  y: number;
}

export function readImagePixelSize(bytes: Uint8Array, mimeType: string): ImagePixelSize | null;
export function resolveImagePreviewDisplaySize(input: {
  imagePixelSize: ImagePixelSize;
  availableWidth: number;
  availableHeight: number;
}): ImagePixelSize;
export function imageExceedsViewport(input: {
  imagePixelSize: ImagePixelSize;
  viewportSize: ImagePixelSize;
}): boolean;
export function resolveImageZoomScrollOffset(input: {
  clickX: number;
  clickY: number;
  fitSize: ImagePixelSize;
  trueSize: ImagePixelSize;
  viewportSize: ImagePixelSize;
}): ImageZoomScrollOffset;
```

`readImagePixelSize` reads image dimensions from PNG, JPEG, GIF, and WebP headers. Unsupported image types return `null`.

### `packages/app/src/file-explorer/preview-target.ts`

`resolveFilePreviewReadTarget` accepts `baseDirectory?: string`. Relative preview paths resolve against an absolute base directory first, normalizing dot segments, then recurse through the normal absolute-path handling. Existing workspace-root handling remains the fallback.

Internal helpers split and join POSIX, Windows drive, and UNC absolute paths so relative path resolution works across supported path shapes.

### `packages/app/src/utils/assistant-image-source.ts`

`resolveAssistantImageSource` accepts `baseDirectory?: string` and passes it to `resolveFilePreviewReadTarget`.

### `packages/app/src/assistant-file-links/parse.ts`

`normalizePathToken` decodes percent-escaped local path tokens with `safeDecodeURIComponent` before slash normalization and line-suffix parsing.

Adds `.gd` to `ASSISTANT_FILE_EXTENSIONS`.

### `docs/development.md`

Documents the image preview sizing gotcha: web/Electron image APIs can report density-corrected CSS dimensions, so previews that need true pixel dimensions should read size from file bytes or headers.

## Tests

New and updated tests include:

- `packages/app/src/components/file-pane-image-size.test.ts`
- `packages/app/src/file-explorer/preview-target.test.ts`
- `packages/app/src/utils/assistant-image-source.test.ts`
- `packages/app/src/assistant-file-links/parse.test.ts`
- `packages/app/src/assistant-file-links/resolver.test.ts`

These cover image header dimension parsing, fit/zoom calculations, relative Markdown image resolution, percent-escaped path parsing, and `.gd` file-link support.
