# Plan: fix-hidden-files-open

## Problem

Files inside hidden directories (e.g., `.github/README.md`) are visible in the tree view but cannot be opened. Clicking them does nothing.

## Root Cause

`vault.getAbstractFileByPath(path)` returns `null` for files in hidden directories because Obsidian does not index files inside hidden folders. The click handler's `instanceof TFile` check then fails silently.

**Location**: `src/tree-view.ts` line 300-301

```typescript
const file = this.app.vault.getAbstractFileByPath(node.path);
if (file instanceof TFile) { // <-- null, so this block is skipped
```

## Solution

Add a fallback for files not in the vault index:

1. Create a **read-only Markdown preview view** (`HiddenFileView extends ItemView`)
2. When `getAbstractFileByPath()` returns null, open `HiddenFileView` with the file path
3. `HiddenFileView` reads file content via `vault.adapter.read(path)` and renders it using Obsidian's `MarkdownRenderer.render()`

## Files to Change

| File | Change |
|------|--------|
| `src/tree-view.ts` | Add `HiddenFileView` class; update file click handler fallback |
| `src/main.ts` | Register `HiddenFileView` view type |
| `src/constants.ts` | Add `VIEW_TYPE_HIDDEN_FILE` constant |
| `src/styles.css` | Add minimal styles for the preview view |

## Implementation Order

1. Add constant for new view type
2. Create `HiddenFileView` class with `MarkdownRenderer` rendering
3. Register view in `main.ts`
4. Update click handler to open `HiddenFileView` for non-indexed files
5. Build and verify
