import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { useQuery } from "@tanstack/react-query";
import type { FileReadResult } from "@getpaseo/client/internal/daemon-client";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import {
  Pressable,
  Image as RNImage,
  ScrollView as RNScrollView,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import type { ASTNode } from "react-native-markdown-display";
import {
  createSharedMarkdownRules,
  MarkdownRenderer,
  type MarkdownStyles,
} from "@/components/markdown/renderer";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useSessionStore, type ExplorerFile } from "@/stores/session-store";
import { useWebScrollViewScrollbar } from "@/components/use-web-scrollbar";
import { useWebScrollbarStyle } from "@/hooks/use-web-scrollbar-style";
import { highlightCode, type HighlightToken } from "@getpaseo/highlight";
import { syntaxTokenStyleFor } from "@/styles/syntax-token-styles";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import { lineNumberGutterWidth } from "@/components/code-insets";
import { CODE_SURFACE_DATASET } from "@/styles/code-surface";
import { isRenderedMarkdownFile } from "@/components/file-pane-render-mode";
import { isWeb } from "@/constants/platform";
import type { AttachmentMetadata } from "@/attachments/types";
import { useAttachmentPreviewUrl } from "@/attachments/use-attachment-preview-url";
import { persistAttachmentFromBytes, persistAttachmentFromDataUrl } from "@/attachments/service";
import { createPreviewAttachmentId, getFileNameFromPath } from "@/attachments/utils";
import { parseImageDataUrl } from "@/attachments/utils";
import { explorerFileFromReadResult } from "@/file-explorer/read-result";
import { resolveFilePreviewReadTarget } from "@/file-explorer/preview-target";
import { resolveWorkspaceFilePaths, type WorkspaceFileLocation } from "@/workspace/file-open";
import { MountedTabActiveContext } from "@/components/split-container";
import { useAppVisible } from "@/hooks/use-app-visible";
import { isFileQueryEnabled } from "@/components/file-pane-enabled";
import { resolveAssistantImageSource } from "@/utils/assistant-image-source";
import {
  imageExceedsViewport,
  readImagePixelSize,
  resolveImagePreviewDisplaySize,
  resolveImageZoomScrollOffset,
  type ImagePixelSize,
} from "./file-pane-image-size";

interface CodeLineProps {
  tokens: HighlightToken[];
  lineNumber: number;
  gutterWidth: number;
  highlighted: boolean;
}

interface FilePreviewBodyProps {
  preview: ExplorerFile | null;
  isLoading: boolean;
  showDesktopWebScrollbar: boolean;
  isMobile: boolean;
  serverId: string;
  client: DaemonClient | null;
  workspaceRoot: string;
  location: WorkspaceFileLocation;
  imagePreviewUri: string | null;
  imagePixelSize: ImagePixelSize | null;
}

function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

interface FileLineSelection {
  lineStart: number;
  lineEnd: number;
}

function formatFileSize({ size }: { size: number }): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

async function createFilePanePreview(file: FileReadResult | null): Promise<{
  file: ExplorerFile | null;
  imageAttachment: AttachmentMetadata | null;
  imagePixelSize: ImagePixelSize | null;
}> {
  if (!file) {
    return { file: null, imageAttachment: null, imagePixelSize: null };
  }

  const explorerFile = explorerFileFromReadResult(file);
  if (file.kind !== "image") {
    return { file: explorerFile, imageAttachment: null, imagePixelSize: null };
  }

  const imageAttachment = await persistAttachmentFromBytes({
    id: createPreviewAttachmentId({
      mimeType: file.mime,
      path: file.path,
      size: file.size,
      modifiedAt: file.modifiedAt,
      contentLength: file.bytes.byteLength,
    }),
    bytes: file.bytes,
    mimeType: file.mime,
    fileName: getFileNameFromPath(file.path),
  });

  return {
    file: explorerFile,
    imageAttachment,
    imagePixelSize: readImagePixelSize(file.bytes, file.mime),
  };
}

function clampLineSelection(input: {
  lineStart?: number;
  lineEnd?: number;
  lineCount: number;
}): FileLineSelection | null {
  if (!input.lineStart || input.lineStart <= 0 || input.lineCount <= 0) {
    return null;
  }
  const lineStart = Math.min(Math.floor(input.lineStart), input.lineCount);
  const rawLineEnd =
    input.lineEnd && input.lineEnd >= input.lineStart ? input.lineEnd : input.lineStart;
  const lineEnd = Math.min(Math.floor(rawLineEnd), input.lineCount);
  return { lineStart, lineEnd: Math.max(lineStart, lineEnd) };
}

const CodeLine = React.memo(function CodeLine({
  tokens,
  lineNumber,
  gutterWidth,
  highlighted,
}: CodeLineProps) {
  const gutterStyle = useMemo(
    () => [codeLineStyles.gutter, inlineUnistylesStyle({ width: gutterWidth })],
    [gutterWidth],
  );
  const lineStyle = useMemo(
    () => [codeLineStyles.line, highlighted && codeLineStyles.highlightedLine],
    [highlighted],
  );
  const keyedTokens = useMemo(
    () => tokens.map((token, index) => ({ key: `${index}-${token.text}`, token })),
    [tokens],
  );
  return (
    <View style={lineStyle}>
      <View style={gutterStyle}>
        <Text numberOfLines={1} style={codeLineStyles.gutterText}>
          {String(lineNumber)}
        </Text>
      </View>
      <Text selectable style={codeLineStyles.lineText}>
        {keyedTokens.map(({ key, token }) => (
          <CodeLineToken key={key} token={token} />
        ))}
      </Text>
    </View>
  );
});

interface CodeLineTokenProps {
  token: HighlightToken;
}

function CodeLineToken({ token }: CodeLineTokenProps) {
  return <Text style={syntaxTokenStyleFor(token.style)}>{token.text}</Text>;
}

const codeLineStyles = StyleSheet.create((theme) => ({
  line: {
    flexDirection: "row",
  },
  highlightedLine: {
    backgroundColor: theme.colors.accentBorder,
  },
  gutter: {
    alignItems: "flex-end",
    paddingRight: theme.spacing[3],
    flexShrink: 0,
  },
  gutterText: {
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    lineHeight: theme.fontSize.code * 1.45,
    opacity: 0.4,
    userSelect: "none",
  },
  lineText: {
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    lineHeight: theme.fontSize.code * 1.45,
    flex: 1,
  },
}));

interface ImageFilePreviewProps {
  imageSource: { uri: string } | null;
  imagePixelSize: ImagePixelSize | null;
  previewScrollRef: React.RefObject<RNScrollView | null>;
  scrollbar: ReturnType<typeof useWebScrollViewScrollbar>;
  showDesktopWebScrollbar: boolean;
}

function getParentDirectory(path: string): string | null {
  const normalized = path.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized) {
    return null;
  }
  if (normalized === "/") {
    return "/";
  }
  if (/^[A-Za-z]:$/.test(normalized)) {
    return `${normalized}/`;
  }
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash < 0) {
    return null;
  }
  if (lastSlash === 0) {
    return "/";
  }
  return normalized.slice(0, lastSlash);
}

const FILE_PREVIEW_MARKDOWN_IMAGE_MIN_HEIGHT = 160;

function resolveMarkdownImageErrorText(
  fileError: unknown,
  dataError: unknown,
  fallbackText: string,
): string {
  if (fileError instanceof Error) {
    return fileError.message;
  }
  if (dataError instanceof Error) {
    return dataError.message;
  }
  return fallbackText;
}

function useResolvedImageAspectRatio(uri: string | null): number | null {
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  useEffect(() => {
    if (!uri) {
      setAspectRatio(null);
      return;
    }

    let cancelled = false;
    RNImage.getSize(
      uri,
      (width, height) => {
        if (!cancelled && width > 0 && height > 0) {
          setAspectRatio(width / height);
        }
      },
      () => {
        if (!cancelled) {
          setAspectRatio(null);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [uri]);

  return aspectRatio;
}

function useMarkdownPreviewImageSource(input: {
  source: string;
  client: DaemonClient | null;
  serverId: string;
  workspaceRoot: string;
  markdownFileDirectory?: string;
  imageUnavailableText: string;
  fallbackErrorText: string;
}): {
  resolvedUri: string | null;
  isLoading: boolean;
  errorText: string;
} {
  const resolution = useMemo(
    () =>
      resolveAssistantImageSource({
        source: input.source,
        workspaceRoot: input.workspaceRoot,
        baseDirectory: input.markdownFileDirectory,
      }),
    [input.markdownFileDirectory, input.source, input.workspaceRoot],
  );
  const dataImage = useMemo(() => parseImageDataUrl(input.source), [input.source]);
  const query = useQuery({
    queryKey: [
      "filePreviewMarkdownImage",
      input.serverId,
      resolution?.kind === "file_rpc" ? resolution.cwd : null,
      resolution?.kind === "file_rpc" ? resolution.path : null,
    ],
    enabled: Boolean(input.client && resolution?.kind === "file_rpc"),
    staleTime: 30_000,
    queryFn: async () => {
      if (!input.client || !resolution || resolution.kind !== "file_rpc") {
        return null;
      }

      const file = await input.client.readFile(resolution.cwd, resolution.path);
      if (file.kind !== "image") {
        throw new Error(input.imageUnavailableText);
      }

      return await persistAttachmentFromBytes({
        id: createPreviewAttachmentId({
          mimeType: file.mime,
          path: file.path || resolution.path,
          size: file.size,
          modifiedAt: file.modifiedAt,
          contentLength: file.bytes.byteLength,
        }),
        bytes: file.bytes,
        mimeType: file.mime,
        fileName: getFileNameFromPath(file.path || resolution.path),
      });
    },
  });
  const dataImageQuery = useQuery({
    queryKey: ["filePreviewMarkdownDataImage", dataImage?.cacheKey ?? null],
    enabled: dataImage !== null,
    staleTime: 30_000,
    queryFn: async () => {
      if (!dataImage) {
        return null;
      }

      return await persistAttachmentFromDataUrl({
        id: createPreviewAttachmentId({
          mimeType: dataImage.mimeType,
          contentLength: dataImage.base64.length,
        }),
        dataUrl: input.source,
        mimeType: dataImage.mimeType,
        fileName: null,
      });
    },
  });

  const fileAssetUri = useAttachmentPreviewUrl(query.data);
  const dataImageAssetUri = useAttachmentPreviewUrl(dataImageQuery.data);
  const directUri = resolution?.kind === "direct" && !dataImage ? resolution.uri : null;

  return {
    resolvedUri: directUri ?? dataImageAssetUri ?? fileAssetUri ?? null,
    isLoading: query.isLoading || dataImageQuery.isLoading,
    errorText: resolveMarkdownImageErrorText(
      query.error,
      dataImageQuery.error,
      input.fallbackErrorText,
    ),
  };
}

function FilePreviewMarkdownImage({
  source,
  alt,
  client,
  serverId,
  workspaceRoot,
  markdownFileDirectory,
  preferredWidth,
}: {
  source: string;
  alt?: string;
  client: DaemonClient | null;
  serverId: string;
  workspaceRoot: string;
  markdownFileDirectory?: string;
  preferredWidth?: number;
}) {
  const { t } = useTranslation();
  const { resolvedUri, isLoading, errorText } = useMarkdownPreviewImageSource({
    source,
    client,
    serverId,
    workspaceRoot,
    markdownFileDirectory,
    imageUnavailableText: t("message.attachments.imagePreviewUnavailable"),
    fallbackErrorText: t("message.attachments.imagePreviewLoadFailed"),
  });
  const aspectRatio = useResolvedImageAspectRatio(resolvedUri);
  const surfaceStyle = useMemo(
    () => [
      filePreviewMarkdownImageStyles.surface,
      preferredWidth ? { maxWidth: preferredWidth } : null,
      aspectRatio ? { aspectRatio } : { height: FILE_PREVIEW_MARKDOWN_IMAGE_MIN_HEIGHT },
    ],
    [aspectRatio, preferredWidth],
  );
  const imageSource = useMemo(() => (resolvedUri ? { uri: resolvedUri } : null), [resolvedUri]);

  if (resolvedUri) {
    return (
      <View style={filePreviewMarkdownImageStyles.frame}>
        <View style={surfaceStyle}>
          <RNImage
            source={imageSource ?? undefined}
            style={filePreviewMarkdownImageStyles.image}
            resizeMode="contain"
            accessibilityLabel={alt}
          />
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={filePreviewMarkdownImageStyles.stateFrame}>
        <LoadingSpinner size="small" />
      </View>
    );
  }

  return (
    <View style={filePreviewMarkdownImageStyles.stateFrame}>
      <Text style={filePreviewMarkdownImageStyles.errorText}>{errorText}</Text>
    </View>
  );
}

const filePreviewMarkdownImageStyles = StyleSheet.create((theme) => ({
  frame: {
    width: "100%",
    minHeight: FILE_PREVIEW_MARKDOWN_IMAGE_MIN_HEIGHT,
    marginBottom: theme.spacing[3],
  },
  surface: {
    width: "100%",
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  stateFrame: {
    width: "100%",
    minHeight: FILE_PREVIEW_MARKDOWN_IMAGE_MIN_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[6],
  },
  errorText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
}));

const filePreviewMarkdownInlineImageStyles = StyleSheet.create(() => ({
  flow: {
    alignSelf: "flex-start",
  },
}));

function ImageFilePreview({
  imageSource,
  imagePixelSize,
  previewScrollRef,
  scrollbar,
  showDesktopWebScrollbar,
}: ImageFilePreviewProps) {
  const horizontalScrollRef = useRef<RNScrollView>(null);
  const [imageViewportSize, setImageViewportSize] = useState<ImagePixelSize | null>(null);
  const [zoomed, setZoomed] = useState(false);

  const handleImageViewportLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setImageViewportSize((current) => {
      if (current && current.width === width && current.height === height) {
        return current;
      }
      return { width, height };
    });
  }, []);

  const fitImageSize = useMemo(() => {
    if (!imagePixelSize || !imageViewportSize) {
      return null;
    }
    return resolveImagePreviewDisplaySize({
      imagePixelSize,
      availableWidth: imageViewportSize.width,
      availableHeight: imageViewportSize.height,
    });
  }, [imagePixelSize, imageViewportSize]);
  const canZoom = useMemo(() => {
    if (!imagePixelSize || !imageViewportSize) {
      return false;
    }
    return imageExceedsViewport({
      imagePixelSize,
      viewportSize: imageViewportSize,
    });
  }, [imagePixelSize, imageViewportSize]);
  const displayedImageSize = useMemo(() => {
    if (zoomed && imagePixelSize) {
      return imagePixelSize;
    }
    return fitImageSize ?? styles.previewImageFallback;
  }, [fitImageSize, imagePixelSize, zoomed]);
  const imageStyle = useMemo(() => [styles.previewImage, displayedImageSize], [displayedImageSize]);
  const overflowX = Boolean(
    zoomed && imagePixelSize && imageViewportSize && imagePixelSize.width > imageViewportSize.width,
  );
  const overflowY = Boolean(
    zoomed &&
    imagePixelSize &&
    imageViewportSize &&
    imagePixelSize.height > imageViewportSize.height,
  );
  const verticalScrollStyle = useMemo(
    () =>
      imageViewportSize
        ? [
            styles.previewContent,
            {
              width:
                zoomed && imagePixelSize
                  ? Math.max(imageViewportSize.width, imagePixelSize.width)
                  : imageViewportSize.width,
            },
          ]
        : styles.previewContent,
    [imagePixelSize, imageViewportSize, zoomed],
  );
  const imageViewportContentStyle = useMemo(() => {
    if (!imageViewportSize) {
      return styles.previewImageContent;
    }
    const alignItems: "flex-start" | "center" = overflowX ? "flex-start" : "center";
    const justifyContent: "flex-start" | "center" = overflowY ? "flex-start" : "center";
    return [
      styles.previewImageContent,
      {
        minWidth: imageViewportSize.width,
        minHeight: imageViewportSize.height,
        alignItems,
        justifyContent,
      },
    ];
  }, [imageViewportSize, overflowX, overflowY]);
  const imagePressableStyle = styles.previewImagePressable;
  const webCursor = useMemo(() => {
    if (!canZoom) {
      return "auto";
    }
    return zoomed ? "zoom-out" : "zoom-in";
  }, [canZoom, zoomed]);
  const webZoomWrapperStyle = useMemo<CSSProperties>(
    () => ({
      cursor: webCursor,
      display: "inline-block",
      lineHeight: 0,
    }),
    [webCursor],
  );

  useEffect(() => {
    setZoomed(false);
    horizontalScrollRef.current?.scrollTo({ x: 0, animated: false });
    previewScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [imageSource?.uri, previewScrollRef]);

  useEffect(() => {
    if (!canZoom && zoomed) {
      setZoomed(false);
    }
  }, [canZoom, zoomed]);

  const toggleZoomAtPoint = useCallback(
    (point?: { clickX: number; clickY: number }) => {
      if (!canZoom) {
        return;
      }
      if (zoomed) {
        setZoomed(false);
        horizontalScrollRef.current?.scrollTo({ x: 0, animated: false });
        previewScrollRef.current?.scrollTo({ y: 0, animated: false });
        return;
      }
      if (!fitImageSize || !imagePixelSize || !imageViewportSize) {
        setZoomed(true);
        return;
      }

      const offset = resolveImageZoomScrollOffset({
        clickX: point?.clickX ?? fitImageSize.width / 2,
        clickY: point?.clickY ?? fitImageSize.height / 2,
        fitSize: fitImageSize,
        trueSize: imagePixelSize,
        viewportSize: imageViewportSize,
      });
      setZoomed(true);
      requestAnimationFrame(() => {
        horizontalScrollRef.current?.scrollTo({ x: offset.x, animated: false });
        previewScrollRef.current?.scrollTo({ y: offset.y, animated: false });
      });
    },
    [canZoom, fitImageSize, imagePixelSize, imageViewportSize, previewScrollRef, zoomed],
  );
  const handleImagePress = useCallback(
    (event: GestureResponderEvent) => {
      toggleZoomAtPoint({
        clickX: event.nativeEvent.locationX,
        clickY: event.nativeEvent.locationY,
      });
    },
    [toggleZoomAtPoint],
  );
  const handleWebImageClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      toggleZoomAtPoint({
        clickX: event.clientX - rect.left,
        clickY: event.clientY - rect.top,
      });
    },
    [toggleZoomAtPoint],
  );
  const imageElement = useMemo(
    () => <RNImage source={imageSource ?? undefined} style={imageStyle} resizeMode="contain" />,
    [imageSource, imageStyle],
  );
  const imageInteraction = useMemo(() => {
    if (isWeb) {
      return React.createElement(
        "div",
        {
          onClick: canZoom ? handleWebImageClick : undefined,
          role: canZoom ? "button" : undefined,
          style: webZoomWrapperStyle,
        },
        imageElement,
      );
    }
    return (
      <Pressable
        accessibilityRole={canZoom ? "button" : undefined}
        disabled={!canZoom}
        onPress={handleImagePress}
        style={imagePressableStyle}
      >
        {imageElement}
      </Pressable>
    );
  }, [
    canZoom,
    handleImagePress,
    handleWebImageClick,
    imageElement,
    imagePressableStyle,
    webZoomWrapperStyle,
  ]);

  return (
    <View style={styles.previewScrollContainer}>
      <View onLayout={handleImageViewportLayout} style={styles.previewImageViewportFrame}>
        <RNScrollView
          ref={horizontalScrollRef}
          horizontal
          bounces={false}
          scrollEnabled={zoomed}
          showsHorizontalScrollIndicator={zoomed}
          style={styles.previewContent}
          contentContainerStyle={styles.previewImageHorizontalScrollContent}
        >
          <RNScrollView
            ref={previewScrollRef}
            bounces={false}
            scrollEnabled={zoomed}
            showsVerticalScrollIndicator={zoomed && !showDesktopWebScrollbar}
            style={verticalScrollStyle}
            contentContainerStyle={imageViewportContentStyle}
            onLayout={scrollbar.onLayout}
            onScroll={scrollbar.onScroll}
            onContentSizeChange={scrollbar.onContentSizeChange}
            scrollEventThrottle={16}
          >
            {imageInteraction}
          </RNScrollView>
        </RNScrollView>
        {scrollbar.overlay}
      </View>
    </View>
  );
}

function FilePreviewBody({
  preview,
  isLoading,
  showDesktopWebScrollbar,
  isMobile,
  serverId,
  client,
  workspaceRoot,
  location,
  imagePreviewUri,
  imagePixelSize,
}: FilePreviewBodyProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const filePath = location.path;
  const isMarkdownFile =
    preview?.kind === "text" && isRenderedMarkdownFile(filePath) && !location.lineStart;

  const previewScrollRef = useRef<RNScrollView>(null);
  const webScrollbarStyle = useWebScrollbarStyle();
  const scrollbar = useWebScrollViewScrollbar(previewScrollRef, {
    enabled: showDesktopWebScrollbar,
  });

  const highlightedLines = useMemo(() => {
    if (!preview || preview.kind !== "text" || isMarkdownFile) {
      return null;
    }

    return highlightCode(preview.content ?? "", filePath);
  }, [isMarkdownFile, preview, filePath]);

  const gutterWidth = useMemo(() => {
    if (!highlightedLines) return 0;
    return lineNumberGutterWidth(highlightedLines.length, theme.fontSize.code);
  }, [highlightedLines, theme.fontSize.code]);
  const lineHeight = theme.fontSize.code * 1.45;
  const lineSelection = useMemo(() => {
    if (!highlightedLines) {
      return null;
    }
    return clampLineSelection({
      lineStart: location.lineStart,
      lineEnd: location.lineEnd,
      lineCount: highlightedLines.length,
    });
  }, [highlightedLines, location.lineEnd, location.lineStart]);

  const imageSource = useMemo(
    () => (imagePreviewUri ? { uri: imagePreviewUri } : null),
    [imagePreviewUri],
  );
  const markdownFileDirectory = useMemo(() => {
    const resolved = resolveWorkspaceFilePaths({
      path: location.path,
      workspaceRoot,
    });
    return resolved ? getParentDirectory(resolved.absolutePath) : null;
  }, [location.path, workspaceRoot]);
  const markdownRules = useMemo(
    () => ({
      ...createSharedMarkdownRules(),
      image: (
        node: ASTNode,
        _children: React.ReactNode[],
        _parent: ASTNode[],
        _styles: MarkdownStyles,
      ) => (
        <FilePreviewMarkdownImage
          key={node.key}
          source={typeof node.attributes?.src === "string" ? node.attributes.src : ""}
          alt={typeof node.attributes?.alt === "string" ? node.attributes.alt : undefined}
          client={client}
          serverId={serverId}
          workspaceRoot={workspaceRoot}
          markdownFileDirectory={markdownFileDirectory ?? undefined}
        />
      ),
    }),
    [client, markdownFileDirectory, serverId, workspaceRoot],
  );
  const renderMarkdownImagePart = useCallback(
    (part: { src: string; alt: string; width?: number }, variant: "inline" | "flow") => {
      if (/^(https?:|data:|blob:)/i.test(part.src)) {
        return null;
      }

      const style = variant === "flow" ? filePreviewMarkdownInlineImageStyles.flow : undefined;
      return (
        <View style={style}>
          <FilePreviewMarkdownImage
            source={part.src}
            alt={part.alt}
            client={client}
            serverId={serverId}
            workspaceRoot={workspaceRoot}
            markdownFileDirectory={markdownFileDirectory ?? undefined}
            preferredWidth={part.width}
          />
        </View>
      );
    },
    [client, markdownFileDirectory, serverId, workspaceRoot],
  );

  useEffect(() => {
    if (!lineSelection) {
      return;
    }
    const timeout = setTimeout(() => {
      previewScrollRef.current?.scrollTo({
        y: Math.max(0, (lineSelection.lineStart - 1) * lineHeight),
        animated: false,
      });
    }, 0);
    return () => clearTimeout(timeout);
  }, [lineHeight, lineSelection]);

  if (isLoading && !preview) {
    return (
      <View style={styles.centerState}>
        <LoadingSpinner size="small" />
        <Text style={styles.loadingText}>{t("panels.file.loading")}</Text>
      </View>
    );
  }

  if (!preview) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.emptyText}>{t("panels.file.noPreview")}</Text>
      </View>
    );
  }

  if (preview.kind === "text") {
    if (isMarkdownFile) {
      return (
        <View style={styles.previewScrollContainer}>
          <RNScrollView
            ref={previewScrollRef}
            style={styles.previewContent}
            contentContainerStyle={styles.previewMarkdownScrollContent}
            onLayout={scrollbar.onLayout}
            onScroll={scrollbar.onScroll}
            onContentSizeChange={scrollbar.onContentSizeChange}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={!showDesktopWebScrollbar}
          >
            <MarkdownRenderer
              text={preview.content ?? ""}
              rules={markdownRules}
              renderImagePart={renderMarkdownImagePart}
            />
          </RNScrollView>
          {scrollbar.overlay}
        </View>
      );
    }

    const lines = highlightedLines ?? [[{ text: preview.content ?? "", style: null }]];
    const keyedLines = lines.map((tokens, index) => ({
      key: `line-${index}`,
      tokens,
      lineNumber: index + 1,
    }));
    const codeLines = (
      <View dataSet={CODE_SURFACE_DATASET}>
        {keyedLines.map(({ key, tokens, lineNumber }) => (
          <CodeLine
            key={key}
            tokens={tokens}
            lineNumber={lineNumber}
            gutterWidth={gutterWidth}
            highlighted={
              Boolean(lineSelection) &&
              lineNumber >= (lineSelection?.lineStart ?? 0) &&
              lineNumber <= (lineSelection?.lineEnd ?? 0)
            }
          />
        ))}
      </View>
    );

    return (
      <View style={styles.previewScrollContainer}>
        <RNScrollView
          ref={previewScrollRef}
          style={styles.previewContent}
          onLayout={scrollbar.onLayout}
          onScroll={scrollbar.onScroll}
          onContentSizeChange={scrollbar.onContentSizeChange}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={!showDesktopWebScrollbar}
        >
          {isMobile ? (
            <View style={styles.previewCodeScrollContent}>{codeLines}</View>
          ) : (
            <RNScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator
              style={webScrollbarStyle}
              contentContainerStyle={styles.previewCodeScrollContent}
            >
              {codeLines}
            </RNScrollView>
          )}
        </RNScrollView>
        {scrollbar.overlay}
      </View>
    );
  }

  if (preview.kind === "image") {
    if (!imagePreviewUri) {
      return (
        <View style={styles.centerState}>
          <LoadingSpinner size="small" />
          <Text style={styles.loadingText}>{t("panels.file.loading")}</Text>
        </View>
      );
    }
    return (
      <ImageFilePreview
        imageSource={imageSource}
        imagePixelSize={imagePixelSize}
        previewScrollRef={previewScrollRef}
        scrollbar={scrollbar}
        showDesktopWebScrollbar={showDesktopWebScrollbar}
      />
    );
  }

  return (
    <View style={styles.centerState}>
      <Text style={styles.emptyText}>{t("panels.file.binaryPreviewUnavailable")}</Text>
      <Text style={styles.binaryMetaText}>{formatFileSize({ size: preview.size })}</Text>
    </View>
  );
}

export function FilePane({
  serverId,
  workspaceRoot,
  location,
}: {
  serverId: string;
  workspaceRoot: string;
  location: WorkspaceFileLocation;
}) {
  const { t } = useTranslation();
  const isMobile = useIsCompactFormFactor();
  const showDesktopWebScrollbar = isWeb && !isMobile;

  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const normalizedWorkspaceRoot = useMemo(() => workspaceRoot.trim(), [workspaceRoot]);
  const normalizedFilePath = useMemo(() => trimNonEmpty(location.path), [location.path]);
  const readTarget = useMemo(
    () =>
      normalizedFilePath
        ? resolveFilePreviewReadTarget({
            path: normalizedFilePath,
            workspaceRoot: normalizedWorkspaceRoot,
          })
        : null,
    [normalizedFilePath, normalizedWorkspaceRoot],
  );

  // Re-read the file when this pane becomes visible again (#445). `isActive`
  // covers tab switches, `isAppVisible` the whole-app background/foreground; the
  // gate itself lives in isFileQueryEnabled.
  const isActive = useContext(MountedTabActiveContext);
  const isAppVisible = useAppVisible();

  const query = useQuery({
    queryKey: ["workspaceFile", serverId, readTarget?.cwd ?? null, readTarget?.path ?? null],
    enabled: isFileQueryEnabled({
      hasReadTarget: Boolean(client && readTarget),
      isTabActive: isActive,
      isAppVisible,
    }),
    queryFn: async () => {
      if (!client || !readTarget) {
        return {
          file: null as ExplorerFile | null,
          error: t("workspace.terminal.hostDisconnected"),
        };
      }
      try {
        const file = await client.readFile(readTarget.cwd, readTarget.path);
        const preview = await createFilePanePreview(file);
        return {
          file: preview.file,
          imageAttachment: preview.imageAttachment,
          imagePixelSize: preview.imagePixelSize,
          error: null,
        };
      } catch (error) {
        return {
          file: null,
          imageAttachment: null,
          imagePixelSize: null,
          error: error instanceof Error ? error.message : t("panels.file.failedToLoad"),
        };
      }
    },
    staleTime: 5_000,
    refetchOnMount: true,
  });
  const imagePreviewUri = useAttachmentPreviewUrl(query.data?.imageAttachment ?? null);

  return (
    <View style={styles.container} testID="workspace-file-pane">
      {query.data?.error ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{query.data.error}</Text>
        </View>
      ) : null}

      <FilePreviewBody
        preview={query.data?.file ?? null}
        isLoading={query.isFetching}
        showDesktopWebScrollbar={showDesktopWebScrollbar}
        isMobile={isMobile}
        serverId={serverId}
        client={client}
        workspaceRoot={normalizedWorkspaceRoot}
        location={location}
        imagePreviewUri={imagePreviewUri}
        imagePixelSize={query.data?.imagePixelSize ?? null}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surface0,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[4],
  },
  loadingText: {
    marginTop: theme.spacing[2],
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
  binaryMetaText: {
    marginTop: theme.spacing[2],
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  previewScrollContainer: {
    flex: 1,
    minHeight: 0,
  },
  previewContent: {
    flex: 1,
    minHeight: 0,
  },
  previewCodeScrollContent: {
    padding: theme.spacing[4],
  },
  previewMarkdownScrollContent: {
    padding: theme.spacing[4],
  },
  previewImageScrollContent: {
    flexGrow: 1,
    padding: theme.spacing[4],
  },
  previewImageViewportFrame: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  previewImageHorizontalScrollContent: {
    flexGrow: 1,
  },
  previewImageContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  previewImagePressable: {
    flexShrink: 0,
  },
  previewImage: {
    flexShrink: 0,
  },
  previewImageFallback: {
    width: "100%",
    height: 420,
  },
}));
