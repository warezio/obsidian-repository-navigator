# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Obsidian Repository Navigator - A plugin that provides a filtered tree view showing only directories containing Markdown files. Designed for Git repositories and codebases where Markdown documentation is mixed with source code.

## Build Commands

```bash
# Development build (with source maps)
bun run dev

# Production build (type-check + minified)
bun run build
```

The build process uses:
1. **esbuild** (`esbuild.config.mjs`) - Bundles TypeScript to `main.js` and CSS to `styles.css`
2. **TypeScript** (`tsconfig.json`) - Type checking with `tsc -noEmit -skipLibCheck`

Both builds run in parallel. The production flag enables minification and disables source maps.

## Architecture

### Core Entry Point
- `src/main.ts` - Plugin class (`RepoNavPlugin`) extending Obsidian's `Plugin` base
  - Registers the view type, ribbon icon, commands, and settings tab
  - Manages settings persistence with `loadData()`/`saveData()`

### View System
- `src/tree-view.ts` - `RepoNavTreeView` extends `ItemView`
  - Renders the tree UI using Obsidian's DOM helpers
  - Manages expand/collapse state in `expandedPaths` Set
  - Listens to vault events (create/delete/rename) with debounced refresh
  - Highlights active file using `active-leaf-change` event

### Tree Building
- `src/tree-builder.ts` - Core tree construction logic
  - `buildTree()` - Async function that filters files by extension, excludes directories, builds nested structure
  - Uses `adapter.list()` for direct filesystem scanning when `showHiddenDirs` is `true` (bypasses Obsidian's index which excludes hidden dirs)
  - Falls back to `vault.getFiles()` when `showHiddenDirs` is `false` (faster, uses Obsidian index)
  - Uses `Map<string, TreeNode>` for efficient path lookup when building hierarchy
  - `sortTree()` - Recursive sorting based on settings (folders-first, A-Z, Z-A)
  - Helper functions for parsing comma-separated extensions and excluded directories
  - `scanDirectory()` - Async recursive function for direct filesystem traversal

### Settings
- `src/settings.ts` - `RepoNavSettingTab` extends `PluginSettingTab`
  - Reactive settings that trigger tree rebuild on change
- `src/constants.ts` - `DEFAULT_SETTINGS` and `VIEW_TYPE_REPO_NAV` constant

### Types
- `src/types.ts` - TypeScript interfaces for `TreeNode` and `RepoNavSettings`

### Styling
- `src/styles.css` - All UI styles using Obsidian CSS variables (`--background-modifier-hover`, `--text-normal`, etc.)

## Plugin Output Files

After building, the following files are generated in the project root:
- `main.js` - Bundled plugin code (CommonJS format)
- `styles.css` - Bundled stylesheet

These are the files actually loaded by Obsidian.

## Key Patterns

### View Registration
Views are registered with `registerView()` and activated via `activateView()` which creates a left sidebar leaf.

### Tree Rendering
- Recursive `renderNode()` with depth-based indentation (`depth * 16px`)
- Directory nodes render chevron + folder icon; file nodes render file icon
- Click handlers: directories toggle expansion, files open in new tab (Cmd/Ctrl+click) or current leaf

### File Display Names
Files are displayed without extensions (`fileName.replace(/\.[^.]+$/, "")`) but stored with full paths.

### Settings Persistence
Settings are automatically persisted via Obsidian's `saveData()` and trigger tree refresh through `saveSettings()` callback.

### Hidden Directory Support
Hidden directories (folders starting with `.` like `.github`, `.obsidian`) are shown by default. This is controlled by the `showHiddenDirs` setting which defaults to `true`.

**Important**: Obsidian's `vault.getFiles()` does NOT include files inside hidden directories. When `showHiddenDirs` is enabled, the plugin uses `adapter.list()` to directly scan the filesystem, bypassing Obsidian's file index. This is the only way to discover files in hidden folders.

### Context Menu for Folders
Right-click on any folder in the tree to open a context menu with:
- **Expand All**: Expands the selected folder and all its descendant folders
- **Collapse All**: Collapses the selected folder and all its descendant folders

The context menu is only available on folder nodes, not on file nodes. Click outside the menu to close it.
