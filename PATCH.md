# Patch Summary: Markdown Image Rendering

Branch: `feat/markdown-image-rendering`

Base: `origin/main`

Anchor commit: ded210698ae5176e5c2044fbf97efbf4f493ad56 — feat(app): render html-ish markdown tables

## Purpose

This branch improves file previews so Markdown image references render in the preview pane and image files use true pixel dimensions for fit/zoom behavior. It also makes assistant file links more tolerant of percent-escaped local paths and Godot `.gd` files.

## User-Facing Changes

- Markdown previews render image references instead of leaving them as unresolved markdown image syntax.
- HTML-ish Markdown tables, including image comparison tables emitted by coding agents, render as horizontally scrollable structured tables instead of raw HTML.
- Relative Markdown image paths resolve against the Markdown file's directory before falling back to the workspace root.
- Data URL images in Markdown previews are persisted and rendered through the attachment preview path.
- File image previews fit to the available viewport, then allow click-to-zoom to true pixel size when the image is larger than the viewport.
- Percent-escaped local paths such as `Ad%20Inf%20Godot/file.gd:37` resolve correctly.
- `.gd` files are recognized by assistant file-link parsing.

## Implementation Details

### `packages/app/src/components/file-pane.tsx`

`createFilePanePreview` now returns `imagePixelSize` in addition to the explorer file and optional preview attachment. For image file reads, it calls `readImagePixelSize(file.bytes, file.mime)` so display sizing uses file header dimensions instead of browser-reported CSS dimensions.

`FilePreviewBody` receives `serverId`, `client`, `workspaceRoot`, and `imagePixelSize`. For rendered Markdown files it builds custom markdown rules with `createSharedMarkdownRules()` and overrides the `image` rule to render `FilePreviewMarkdownImage`.

It also passes a `renderImagePart` callback into `MarkdownRenderer` for HTML-ish inline image parts. The callback leaves direct `http:`, `https:`, `data:`, and `blob:` image sources on the generic renderer path, but routes local/relative sources through `FilePreviewMarkdownImage` so table cell images and inline HTML images resolve against the current Markdown file directory. For flow images it wraps the preview with `alignSelf: "flex-start"` so narrow badges and table images do not stretch across the full row. `FilePreviewMarkdownImage` accepts `preferredWidth?: number` and applies it as a `maxWidth` on the preview surface, preserving safe HTML `width` attributes without forcing oversized images beyond their available parent.

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

### `packages/app/src/components/markdown/html-ish.ts`

The HTML-ish Markdown splitter now has a structured table display part:

```ts
export interface MarkdownTableCellPart {
  parts: MarkdownDisplayPart[];
}

export interface MarkdownTablePart {
  kind: "table";
  header: MarkdownTableCellPart[];
  rows: MarkdownTableCellPart[][];
}
```

`MarkdownDisplayPart` includes `MarkdownTablePart` alongside plain markdown, details blocks, and inline images.

`splitHtmlishTokens` checks for a parseable table before inline image extraction. `parseHtmlTableAt` accepts either:

- A direct `<table>...</table>` at the current token.
- A wrapping `<div>...</div>` whose only non-comment, non-whitespace child content is one table.

The parser requires a matching close tag and at least one non-empty parsed row. The first parsed row becomes `header`; subsequent rows become `rows`. It ignores unrelated tokens inside table sections unless they form rows/cells.

`parseTableRows` recursively descends through `<thead>`, `<tbody>`, and `<tfoot>`, then extracts `<tr>` ranges. `parseTableCells` extracts `<th>` and `<td>` ranges from a row. `renderTableCell` runs the existing HTML-ish splitter recursively over each cell and trims leading/trailing markdown whitespace, so cells can contain markdown text, details parts, safe inline images, or nested supported HTML-ish parts. Safe image handling is unchanged: local paths are allowed when they have no unsafe characters or scheme, `http(s)` and safe data image URLs are allowed, and unsafe schemes such as `javascript:` remain inert markdown.

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

### `packages/app/src/components/markdown/renderer.tsx`

`MarkdownRendererProps` now includes:

```ts
renderImagePart?:
  | ((part: MarkdownInlineImagePart, variant: "inline" | "flow") => ReactNode)
  | null;
```

The renderer includes `renderImagePart` in the memoized part-rendering props and passes it to inline image rendering in normal inline contexts, flow-image rows, details bodies, and structured table cells. If the callback returns a node, that node replaces the default `Image` for the parsed HTML-ish image part. If it returns `null` or is absent, the renderer uses the default remote/data image behavior.

`MarkdownPart` dispatches `part.kind === "table"` to `MarkdownStructuredTable`. Tables render as horizontal `ScrollView`s with a bordered table frame, themed header background, row separators, and fixed cell widths. The renderer computes column widths from all header/body cells using `MARKDOWN_TABLE_CELL_MIN_WIDTH` as the floor and each cell's preferred content width as the max. Inline image parts contribute their parsed `width` attribute when present; other content uses the minimum width. `MarkdownStructuredTableCell` renders each cell by recursively calling `MarkdownPartList`, preserving nested markdown, image overrides, details, and other supported display parts inside cells.

The existing markdown-it table rules are centralized in `createMarkdownTableRules()` and included in `createSharedMarkdownRules()`. Markdown pipe tables continue through `react-native-markdown-display`; HTML-ish tables use the structured `MarkdownTablePart` path.

### `packages/app/src/assistant-file-links/parse.ts`

`normalizePathToken` decodes percent-escaped local path tokens with `safeDecodeURIComponent` before slash normalization and line-suffix parsing.

Adds `.gd` to `ASSISTANT_FILE_EXTENSIONS`.

### `docs/development.md`

Documents the image preview sizing gotcha: web/Electron image APIs can report density-corrected CSS dimensions, so previews that need true pixel dimensions should read size from file bytes or headers.

## Tests

New and updated tests include:

- `packages/app/src/components/file-pane-image-size.test.ts`
- `packages/app/src/components/markdown/html-ish.test.ts`
- `packages/app/src/file-explorer/preview-target.test.ts`
- `packages/app/src/utils/assistant-image-source.test.ts`
- `packages/app/src/assistant-file-links/parse.test.ts`
- `packages/app/src/assistant-file-links/resolver.test.ts`

These cover image header dimension parsing, fit/zoom calculations, relative Markdown image resolution, safe HTML-ish table parsing with local image sources, percent-escaped path parsing, and `.gd` file-link support.
