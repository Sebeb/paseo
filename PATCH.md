# Patch Summary: Agent Tab ID Search in Mobile Tab Switcher

Branch: `feat/tab-search-agent-id-chat-validation`

Base: `origin/main`

Anchor commit: 54c6ef8afd3c7fb45a9ceedd49c8f55339cb4432 - feat(app): match agent tabs by agent ID in tab switcher search

## Branch Scope

This branch adds one user-facing behavior: agent tabs in the mobile workspace tab switcher can be found by pasting a full agent UUID. The implementation does this by adding a small, opt-in search surface to combobox options and then attaching each agent tab's `agentId` to that surface.

The reconstructable branch delta is the diff from merge-base `d3186291210fd7463455b88e21b37713b95987a5` to the anchor commit above. It touches only:

- `packages/app/src/components/ui/combobox-options.ts`
- `packages/app/src/components/ui/combobox-options.test.ts`
- `packages/app/src/screens/workspace/workspace-screen.tsx`

## UUID-Gated Combobox Search Text

### Purpose

Combobox options can now expose extra fields that participate in search only after the query passes a validator. This is designed for fields such as agent UUIDs: the full value should be searchable when a user pastes it, but partial or malformed UUID text should not pollute normal fuzzy matching or make unrelated options appear.

### Files

- `packages/app/src/components/ui/combobox-options.ts`
- `packages/app/src/components/ui/combobox-options.test.ts`

### Public Surface

`ComboboxOptionModel` gains an optional `validatedSearchText` property:

```ts
validatedSearchText?: {
  kind: "uuid";
  fields: string[];
};
```

There are no new exports. The validation helper is private to `combobox-options.ts`.

### Behavior

`scoreOption(opt, search)` keeps the existing search order and ranking rules:

1. Score `opt.label` and `opt.id` with `scoreTextFields(search, [opt.label, opt.id])`.
2. If that produces a score, return it immediately.
3. If the option has `validatedSearchText.kind === "uuid"` and the whole search string is a syntactically valid UUID, score `validatedSearchText.fields`.
4. If a validated field score exists, return it.
5. Otherwise, fall back to `opt.description` if present and add `DESCRIPTION_FALLBACK_TIER` to keep description matches below primary fields.

The UUID validator is:

```ts
/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
```

That means the gated fields are searched only for full, hyphenated UUID strings. The check is case-insensitive, accepts UUID version nibbles `1` through `8`, and accepts variant nibbles `8`, `9`, `a`, or `b`. Invalid queries such as UUID-shaped strings containing non-hex characters do not search the gated fields at all.

Validated fields use the existing `scoreTextFields` path, so they inherit the existing token handling, case normalization, exact/prefix/boundary/subsequence scoring, and sorting through `compareMatchScores`. Empty searches still return all options unchanged through `filterAndRankComboboxOptions`.

### Tests

`combobox-options.test.ts` adds coverage for the new search path:

- A valid UUID query matches an option whose `validatedSearchText.fields` contains that UUID, even when the label and description are generic.
- An invalid UUID-shaped query does not check the gated fields and returns no match.

Existing tests continue to cover label, id, description, ordering, case-insensitivity, and fuzzy matching behavior.

## Mobile Workspace Tab Switcher Search

### Purpose

The mobile workspace tab switcher can now search instead of acting as a fixed, non-searchable picker. Agent tabs additionally expose their agent UUID to the gated combobox search surface so a user can paste an agent ID and jump to the matching tab.

### Files

- `packages/app/src/screens/workspace/workspace-screen.tsx`

### Public Surface

No exported types, routes, RPCs, schemas, persisted keys, or localization strings change.

The local `tabSwitcherOptions` value now builds options shaped like:

```ts
{
  id: tab.key,
  label: getFallbackTabOptionLabel(tab, tabFallbackLabels),
  description: getFallbackTabOptionDescription(tab, tabFallbackLabels),
  validatedSearchText:
    tab.target.kind === "agent"
      ? { kind: "uuid", fields: [tab.target.agentId] }
      : undefined,
}
```

The `Combobox` instance inside `MobileWorkspaceTabSwitcher` no longer passes `searchable={false}`. Because `Combobox` defaults `searchable` to `true`, the mobile switcher now renders its built-in search field and filters options by the normal combobox search rules.

### Behavior

The mobile tab switcher still uses `tab.key` as the combobox option id and still calls the existing `onSelectSwitcherTab` handler when an option is selected. Searching by agent UUID only affects which option is visible and ranked; it does not change tab identity or selection semantics.

Only agent tabs attach `validatedSearchText`. Terminal, browser, setup, draft, and other non-agent tabs keep searching by their existing label, option id, and description fields only.

For agent tabs, a full valid agent UUID can match `tab.target.agentId` even when the visible label and description do not contain the UUID. Partial UUIDs, malformed UUIDs, or arbitrary fuzzy fragments do not match the hidden agent ID field because the combobox validates the query before reading `validatedSearchText.fields`.

The mobile switcher's visible text stays driven by existing fallback labels and descriptions from `getFallbackTabOptionLabel` and `getFallbackTabOptionDescription`; this branch does not expose agent IDs in the UI.

## Cross-Cutting Effects

- No persistence format changes.
- No daemon, protocol, relay, CLI, or desktop package changes are part of the branch delta.
- No feature flags or compatibility gates are needed because the change is entirely client-side UI behavior.
- No source documentation updates are required beyond this branch-level `PATCH.md`.
