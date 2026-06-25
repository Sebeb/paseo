# Patch Summary: Workspace Script Run Button

Branch: `split/workspace-script-run-button`

Base: `origin/main`

Primary commit before this writeup: new split branch created for restored script-button polish

## Purpose

This branch splits the workspace scripts toolbar control into a direct run action and a dropdown selector. It was created because the requested script-button behavior did not fit the existing sidebar, vertical-tabs, prompt, or thinking feature branches.

## User-Facing Changes

- In split presentation, the scripts control has a primary play button that runs the last-run script.
- The adjacent caret opens the full scripts dropdown menu.
- The first script is used as the primary action until the user runs a script from either the primary action or the dropdown.
- Running a script from the dropdown updates the primary action target.
- Ghost presentation remains compact and menu-only.

## Implementation Details

### `packages/app/src/screens/workspace/workspace-scripts-button.tsx`

- Tracks `lastRunScriptName` locally in the button component.
- Routes both menu-row run actions and the primary action through the same `handleStartScript` callback.
- Mirrors the existing "open in" split-control structure:
  - primary `Pressable` for the direct action
  - separate `DropdownMenuTrigger` for the caret/menu
- Keeps pending mutation state disabling the primary action while a script start request is in flight.

### `packages/app/src/screens/workspace/workspace-scripts-button.test.tsx`

- Adds coverage that the primary action starts the first script initially.
- Verifies that running another script from the dropdown updates the primary action to that script.
- Keeps existing checks for split and ghost caret behavior.

## Verification

Run the focused test with:

```bash
npx vitest run packages/app/src/screens/workspace/workspace-scripts-button.test.tsx --bail=1
```
