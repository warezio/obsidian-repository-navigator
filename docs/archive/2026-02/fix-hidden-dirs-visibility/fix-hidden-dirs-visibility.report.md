# Completion Report: fix-hidden-dirs-visibility

## Overview

| Item | Detail |
|------|--------|
| Feature | fix-hidden-dirs-visibility |
| Date | 2026-02-12 |
| Phase | Completed |
| Branch | feature/folder-context |

## Problem Statement

Hidden directories (folders starting with `.` such as `.github`, `.obsidian`) were not visible in the Repository Navigator tree view, even when the "Show hidden directories" setting was enabled. The setting toggle had no effect.

## Root Cause

Obsidian's `app.vault.getFiles()` API does **not** return files located inside hidden directories. This is an Obsidian platform limitation, not a code logic error. The tree builder relied entirely on `vault.getFiles()`, so hidden directories were never included in the file list regardless of the setting value.

## Solution

Implemented a dual-path file discovery strategy in `tree-builder.ts`:

1. **When `showHiddenDirs` is `true`**: Uses `app.vault.adapter.list()` for direct filesystem scanning via the new `scanDirectory()` recursive async function. This bypasses Obsidian's file index and discovers all files including those in hidden directories.

2. **When `showHiddenDirs` is `false`**: Continues using `app.vault.getFiles()` for optimal performance, leveraging Obsidian's built-in file index.

### Key Changes

| File | Change |
|------|--------|
| `src/tree-builder.ts` | Added async `scanDirectory()` function using `adapter.list()`; made `buildTree()` async returning `Promise<TreeNode>`; conditional path based on `showHiddenDirs` |
| `src/tree-view.ts` | Updated `onOpen()` and `refreshTree()` to `await buildTree()` |
| `src/main.ts` | Removed incorrect migration code that forced `showHiddenDirs = true`; added `await` to `view.refreshTree()` |
| `CLAUDE.md` | Updated documentation to describe `adapter.list()` approach |

### Code Architecture

```
buildTree(app, settings)
  ├── showHiddenDirs = true
  │   └── scanDirectory(adapter, "", extensions, excludedSet, true)
  │       └── adapter.list(dirPath)  ← Direct filesystem access
  │           ├── Filter files by extension
  │           └── Recurse into subfolders (respecting excludedSet)
  └── showHiddenDirs = false
      └── app.vault.getFiles()  ← Obsidian indexed files (faster)
```

## Verification

- Build passes with `bun run build` (type-check + production bundle)
- Hidden directories (`.github`, `.obsidian`, etc.) now appear in the tree when setting is enabled
- Setting toggle correctly switches between filesystem scan and indexed file modes
- Excluded directories filter applies correctly in both modes
- No performance regression for non-hidden directory mode

## Lessons Learned

1. **Obsidian API limitation**: `vault.getFiles()` is an indexed API that excludes hidden directories by design. For full filesystem access, `vault.adapter.list()` must be used.
2. **Migration anti-pattern**: Forcing a setting value on every load (e.g., always setting `showHiddenDirs = true`) prevents users from changing that setting. Settings migrations should be one-time operations with version guards.
3. **Minified JS values**: In minified JavaScript, `!0` equals `true` and `!1` equals `false`. This is a common minification optimization.
