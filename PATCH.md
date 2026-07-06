# Patch Summary: macOS Liquid Glass Sidebar

Branch: `feat/macos-liquid-glass-sidebar`

Base: `origin/main`

Anchor commit: 37bb29db3d659ad89cbecc6baa521ed3af263da4 — feat(desktop): enable mac sidebar glass

## macOS Electron Sidebar Glass

### Purpose

This branch enables the pinned left sidebar in the Electron desktop app on macOS to use Electron's native sidebar vibrancy material. The effect is intentionally constrained to macOS Electron desktop windows: mobile sidebars, browser web, Windows, and Linux keep opaque surfaces.

### Files

- `packages/app/src/utils/sidebar-glass.electron.ts`
- `packages/app/src/utils/sidebar-glass.ts`
- `packages/app/src/app/_layout.tsx`
- `packages/app/src/components/left-sidebar.tsx`
- `packages/desktop/src/main.ts`
- `packages/desktop/src/window/window-manager.ts`
- `packages/desktop/src/window/window-manager.test.ts`
- `docs/design.md`

### Public Surface

`packages/app/src/utils/sidebar-glass.electron.ts` adds:

```ts
export function getIsSidebarGlassEnabled(): boolean;
```

The Electron-specific implementation returns `getIsElectronMac()` from `@/constants/platform`, so the glass effect is enabled only when Metro resolves the `.electron.ts` module and the runtime is macOS Electron.

`packages/app/src/utils/sidebar-glass.ts` adds the cross-platform fallback:

```ts
export function getIsSidebarGlassEnabled(): boolean;
```

The fallback always returns `false`, preserving opaque chrome for native, browser web, Windows, Linux, and any non-Electron module resolution path.

`packages/desktop/src/window/window-manager.ts` adds:

```ts
export function getMainWindowBackgroundColor(input: {
  platform: NodeJS.Platform;
  theme: WindowTheme;
}): string;
```

It returns `"#00000000"` on `darwin` so native vibrancy can show through the BrowserWindow background, and delegates to the existing `getWindowBackgroundColor(theme)` on every other platform.

The existing `getMainWindowChromeOptions(input)` return type is expanded to include Electron's `vibrancy` and `visualEffectState` constructor options. On macOS it now returns:

```ts
{
  titleBarStyle: "hidden",
  titleBarOverlay: true,
  trafficLightPosition: { x: 16, y: 14 },
  vibrancy: "sidebar",
  visualEffectState: "active",
}
```

The non-mac path is unchanged: it remains frameless, hides the menu bar, and uses a theme-colored `titleBarOverlay`.

### Behavior

The Electron desktop window on macOS now has a transparent BrowserWindow background and native `sidebar` vibrancy. The app shell is made transparent only when `getIsSidebarGlassEnabled()` is true, while the main content pane keeps an opaque `surface0` fill. This lets only the pinned sidebar area reveal the native material and keeps workspace/chat content visually stable.

`RootLayout` in `packages/app/src/app/_layout.tsx` computes `rootShellStyle` with `useMemo()`. When sidebar glass is enabled it applies `[layoutStyles.surfaceFill, layoutStyles.transparentShell]`; otherwise it keeps `layoutStyles.surfaceFill`. `transparentShell` overrides the shell background to `"transparent"` while preserving flex sizing from `surfaceFill`.

`AppContainer` computes `isDesktopSidebarGlassEnabled = getIsSidebarGlassEnabled() && !isCompactLayout`. The extra compact-layout guard prevents the compact/mobile sidebar path from inheriting the transparent shell. The container's `shellStyle` mirrors the root shell behavior only for the non-compact desktop glass case.

The previous generic `flexStyle` wrappers around routed content are replaced with `layoutStyles.contentPane`. `contentPane` is `flex: 1` plus `backgroundColor: theme.colors.surface0`, ensuring the main pane remains opaque even when the outer app shell is transparent.

`DesktopWindowControlsSync` now sends a transparent titlebar overlay background to Electron when sidebar glass is enabled:

```ts
const backgroundColor = isSidebarGlassEnabled ? "#00000000" : surface0;
```

It still sends the current theme foreground color. The effect is scoped through `getIsSidebarGlassEnabled()` rather than direct platform checks in the component.

`DesktopSidebar` in `packages/app/src/components/left-sidebar.tsx` checks `getIsSidebarGlassEnabled()` and conditionally adds `styles.desktopSidebarBorderGlass` to the desktop sidebar border style. The base sidebar still provides sizing, the right border, and the normal `surfaceSidebar` background. The glass style softens the chrome with:

```ts
borderRightColor: `${theme.colors.border}99`;
backgroundColor: `${theme.colors.surfaceSidebar}cc`;
```

That keeps a subtle readable scrim over native vibrancy instead of making the sidebar fully transparent.

`packages/desktop/src/main.ts` now calls `getMainWindowBackgroundColor({ platform: process.platform, theme: systemTheme })` when creating the BrowserWindow. This preserves previous theme-matched backgrounds off macOS and switches only macOS to a transparent window background.

## Desktop Window Chrome

### Purpose

The desktop window-manager helpers now distinguish the generic theme-colored app background from the main window background needed for macOS vibrancy.

### Files

- `packages/desktop/src/window/window-manager.ts`
- `packages/desktop/src/main.ts`
- `packages/desktop/src/window/window-manager.test.ts`

### Public Surface

`getWindowBackgroundColor(theme: WindowTheme): string` remains unchanged and continues to return `"#181B1A"` for dark mode and `"#ffffff"` for light mode.

`getMainWindowBackgroundColor(input)` is the new BrowserWindow-specific helper. It takes both platform and theme because transparency is a platform decision and the fallback color remains theme-dependent.

### Behavior

On macOS, `getMainWindowChromeOptions()` adds Electron's native vibrancy settings and leaves the window with a hidden title bar, titlebar overlay, and the existing traffic-light position. On Windows and Linux, the chrome options remain opaque and frameless with `autoHideMenuBar: true`.

This separation prevents non-mac platforms from receiving transparent backgrounds or vibrancy-specific options while giving macOS the combination Electron needs: transparent window background plus active sidebar vibrancy.

## Tests

### Purpose

The existing window-manager unit tests cover the new background helper and the macOS chrome options.

### Files

- `packages/desktop/src/window/window-manager.test.ts`

### Behavior

The test suite now asserts that `getMainWindowBackgroundColor()` returns `"#00000000"` for both light and dark themes on `darwin`, and returns the previous opaque theme colors for non-mac platforms.

The macOS `getMainWindowChromeOptions()` expectation now includes:

```ts
vibrancy: "sidebar",
visualEffectState: "active",
```

The Windows and Linux expectations are unchanged, which documents that the glass behavior is macOS-only.

## Design Documentation

### Purpose

The design system documentation records the platform boundary for this visual treatment so future UI changes do not spread transparency or blur behavior to unsupported surfaces.

### Files

- `docs/design.md`

### Behavior

The responsiveness section now states that macOS Electron uses native window vibrancy for the pinned left sidebar, with a transparent window background and outer shell, a subtle sidebar scrim, and an opaque `surface0` main content pane. It explicitly says not to make mobile sidebars, browser web, Windows, or Linux transparent for this effect.
