# Design: Obsidian Repository Navigator v0.1.0

> **Feature:** obsidian-repo-nav
> **Created:** 2026-02-07
> **Status:** In Progress
> **Plan Reference:** [docs/01-plan/features/obsidian-repo-nav.plan.md](../../01-plan/features/obsidian-repo-nav.plan.md)
> **PRD Reference:** [.claude/docs/prd.md](../../../.claude/docs/prd.md)

---

## 1. Project Structure

```
obsidian-repo-nav/
  manifest.json           # Obsidian plugin manifest
  package.json            # Node.js project config
  tsconfig.json           # TypeScript configuration
  esbuild.config.mjs      # Build script
  styles.css              # Plugin stylesheet
  src/
    main.ts               # Plugin entry point
    constants.ts           # Shared constants and defaults
    types.ts               # TypeScript interfaces and types
    settings.ts            # Settings tab UI and persistence
    tree-builder.ts        # Tree data construction from vault
    tree-view.ts           # ItemView sidebar rendering
```

---

## 2. Configuration Files

### 2.1 manifest.json

```json
{
  "id": "obsidian-repo-nav",
  "name": "Repository Navigator",
  "version": "0.1.0",
  "minAppVersion": "1.0.0",
  "description": "A sidebar tree view that shows only directories containing Markdown files, including hidden directories.",
  "author": "warezio",
  "authorUrl": "https://github.com/warezio",
  "isDesktopOnly": false
}
```

### 2.2 package.json

```json
{
  "name": "obsidian-repo-nav",
  "version": "0.1.0",
  "description": "Obsidian plugin for navigating repositories with Markdown-filtered tree view",
  "main": "main.js",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production"
  },
  "keywords": [],
  "author": "warezio",
  "license": "MIT",
  "devDependencies": {
    "@types/node": "^22.0.0",
    "esbuild": "^0.24.0",
    "obsidian": "latest",
    "typescript": "^5.6.0"
  }
}
```

### 2.3 tsconfig.json

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "inlineSourceMap": true,
    "inlineSources": true,
    "module": "ESNext",
    "target": "ES6",
    "allowJs": true,
    "noImplicitAny": true,
    "moduleResolution": "node",
    "importHelpers": true,
    "isolatedModules": true,
    "strictNullChecks": true,
    "lib": ["DOM", "ES5", "ES6", "ES7"]
  },
  "include": ["src/**/*.ts"]
}
```

### 2.4 esbuild.config.mjs

```javascript
import esbuild from "esbuild";
import process from "process";

const prod = process.argv[2] === "production";

esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
}).catch(() => process.exit(1));
```

---

## 3. Type Definitions — `src/types.ts`

```typescript
/** Represents a single node (directory or file) in the filtered tree. */
export interface TreeNode {
  /** Display name (file name without extension for files, dir name for dirs) */
  name: string;
  /** Vault-relative path (e.g., "docs/api/README.md" or ".github") */
  path: string;
  /** Whether this node is a directory or a file */
  type: "directory" | "file";
  /** Child nodes, sorted per settings. Empty array for files. */
  children: TreeNode[];
}

/** Plugin settings persisted to data.json */
export interface RepoNavSettings {
  /** Include dot-prefixed directories in the tree. Default: true */
  showHiddenDirs: boolean;
  /** Comma-separated file extensions to include. Default: ".md" */
  fileExtensions: string;
  /** Comma-separated directory names to always exclude. Default: "node_modules,.git" */
  excludedDirs: string;
  /** Sort order for tree nodes. Default: "folders-first" */
  sortOrder: "az" | "za" | "folders-first";
  /** Start with all directories collapsed. Default: false */
  collapseOnStartup: boolean;
}
```

---

## 4. Constants — `src/constants.ts`

```typescript
import { RepoNavSettings } from "./types";

/** Unique identifier for the sidebar view, registered with Obsidian */
export const VIEW_TYPE_REPO_NAV = "repo-nav-tree-view";

/** Default plugin settings */
export const DEFAULT_SETTINGS: RepoNavSettings = {
  showHiddenDirs: true,
  fileExtensions: ".md",
  excludedDirs: "node_modules,.git",
  sortOrder: "folders-first",
  collapseOnStartup: false,
};

/** Lucide icon ID used for ribbon and view (available in Obsidian) */
export const ICON_ID = "folder-tree";
```

---

## 5. Plugin Entry Point — `src/main.ts`

### Class: `RepoNavPlugin extends Plugin`

| Member | Type | Description |
|--------|------|-------------|
| `settings` | `RepoNavSettings` | Loaded from `data.json` |

### Lifecycle Methods

#### `onload(): Promise<void>`

```
1. Load settings from data.json (merge with DEFAULT_SETTINGS)
2. Register the ItemView:
     this.registerView(VIEW_TYPE_REPO_NAV, (leaf) => new RepoNavTreeView(leaf, this))
3. Add ribbon icon:
     this.addRibbonIcon(ICON_ID, "Repository Navigator", () => this.activateView())
4. Add command:
     this.addCommand({
       id: "open-repo-nav",
       name: "Open tree view",
       callback: () => this.activateView()
     })
5. Register settings tab:
     this.addSettingTab(new RepoNavSettingTab(this.app, this))
6. On layout ready, activate view if it was open:
     this.app.workspace.onLayoutReady(() => this.activateView())
```

#### `onunload(): void`

```
1. Detach all leaves of VIEW_TYPE_REPO_NAV
```

#### `activateView(): Promise<void>`

```
1. Check if a leaf with VIEW_TYPE_REPO_NAV already exists
2. If not, create one:
     leaf = this.app.workspace.getLeftLeaf(false)
     await leaf.setViewState({ type: VIEW_TYPE_REPO_NAV, active: true })
3. Reveal the leaf:
     this.app.workspace.revealLeaf(leaf)
```

#### `loadSettings(): Promise<void>`

```
1. this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
```

#### `saveSettings(): Promise<void>`

```
1. await this.saveData(this.settings)
2. Notify active tree view to rebuild (settings changed)
```

---

## 6. Tree Builder — `src/tree-builder.ts`

### Function: `buildTree(app: App, settings: RepoNavSettings): TreeNode`

**Purpose:** Construct a filtered tree of directories and files matching the configured extensions.

**Algorithm (detailed):**

```
function buildTree(app, settings):
  // Step 1: Parse settings
  extensions = parseExtensions(settings.fileExtensions)    // [".md"]
  excludedSet = parseExcludedDirs(settings.excludedDirs)   // Set{"node_modules", ".git"}

  // Step 2: Collect matching files
  allFiles = app.vault.getFiles()
  matchingFiles = allFiles.filter(f => extensions.some(ext => f.path.endsWith(ext)))

  // Step 3: Build path-to-node map
  nodeMap = new Map<string, TreeNode>()
  root = { name: "/", path: "", type: "directory", children: [] }
  nodeMap.set("", root)

  for each file in matchingFiles:
    segments = file.path.split("/")
    fileName = segments.pop()

    // Ensure all ancestor directories exist in the map
    currentPath = ""
    for each segment in segments:
      parentPath = currentPath
      currentPath = currentPath ? currentPath + "/" + segment : segment

      // Skip excluded directories
      if excludedSet.has(segment): skip this file entirely (break)

      // Skip hidden directories if setting is off
      if !settings.showHiddenDirs && segment.startsWith("."): skip (break)

      if !nodeMap.has(currentPath):
        dirNode = { name: segment, path: currentPath, type: "directory", children: [] }
        nodeMap.set(currentPath, dirNode)
        parentNode = nodeMap.get(parentPath)
        parentNode.children.push(dirNode)

    // Add file node (only if we didn't break/skip)
    if file was not skipped:
      fileNode = {
        name: fileName.replace(/\.[^.]+$/, ""),  // strip extension
        path: file.path,
        type: "file",
        children: []
      }
      parentNode = nodeMap.get(currentPath)
      parentNode.children.push(fileNode)

  // Step 4: Sort all nodes recursively
  sortTree(root, settings.sortOrder)

  return root
```

### Function: `sortTree(node: TreeNode, order: string): void`

```
function sortTree(node, order):
  if node.type === "file": return

  for each child in node.children:
    sortTree(child, order)

  switch order:
    case "folders-first":
      // Directories first (alphabetical), then files (alphabetical)
      node.children.sort((a, b) =>
        if a.type !== b.type: return a.type === "directory" ? -1 : 1
        return a.name.localeCompare(b.name)
      )
    case "az":
      node.children.sort((a, b) => a.name.localeCompare(b.name))
    case "za":
      node.children.sort((a, b) => b.name.localeCompare(a.name))
```

### Function: `parseExtensions(input: string): string[]`

```
Split by comma, trim whitespace, ensure each starts with "."
Example: ".md, .mdx" → [".md", ".mdx"]
```

### Function: `parseExcludedDirs(input: string): Set<string>`

```
Split by comma, trim whitespace, return as Set
Example: "node_modules, .git" → Set{"node_modules", ".git"}
```

---

## 7. Tree View — `src/tree-view.ts`

### Class: `RepoNavTreeView extends ItemView`

| Member | Type | Description |
|--------|------|-------------|
| `plugin` | `RepoNavPlugin` | Reference to the plugin instance |
| `treeData` | `TreeNode \| null` | Current tree data |
| `expandedPaths` | `Set<string>` | Tracks which directories are expanded |
| `debounceTimer` | `number \| null` | Timer ID for debounced rebuild |

### ItemView Overrides

#### `getViewType(): string`
Returns `VIEW_TYPE_REPO_NAV`

#### `getDisplayText(): string`
Returns `"Repository Navigator"`

#### `getIcon(): string`
Returns `ICON_ID` (`"folder-tree"`)

#### `onOpen(): Promise<void>`

```
1. Initialize expandedPaths = new Set()
2. Build tree data: this.treeData = buildTree(this.app, this.plugin.settings)
3. Render the view (header + tree)
4. Register vault event listeners:
     this.registerEvent(this.app.vault.on("create", () => this.debouncedRefresh()))
     this.registerEvent(this.app.vault.on("delete", () => this.debouncedRefresh()))
     this.registerEvent(this.app.vault.on("rename", () => this.debouncedRefresh()))
5. Register workspace event listener (active file highlight):
     this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.updateActiveFile()))
6. If collapseOnStartup is false, auto-expand root-level directories
```

#### `onClose(): Promise<void>`

```
1. Clear debounce timer if active
2. Clear container element
```

### Custom Methods

#### `renderView(): void`

```
1. Clear this.containerEl.children[1] (the content area, index 1; index 0 is the header)
2. Create content container:
     contentEl = this.containerEl.children[1]
     contentEl.empty()

3. Render header actions:
     headerEl = contentEl.createDiv({ cls: "repo-nav-header" })
     - "Collapse All" button: collapseAllBtn (icon: "chevrons-down-up")
       → onClick: expandedPaths.clear(), renderTree()
     - "Refresh" button: refreshBtn (icon: "refresh-cw")
       → onClick: rebuild tree data + renderTree()

4. Render tree container:
     treeEl = contentEl.createDiv({ cls: "repo-nav-tree" })

5. If no treeData or root has 0 children:
     treeEl.createDiv({ cls: "repo-nav-empty", text: "No Markdown files found in this vault." })
     return

6. Render root children into treeEl:
     for each child of treeData.children:
       renderNode(treeEl, child, 0)
```

#### `renderNode(parentEl: HTMLElement, node: TreeNode, depth: number): void`

```
1. Create node element:
     nodeEl = parentEl.createDiv({ cls: "repo-nav-node" })
     nodeEl.style.paddingLeft = `${depth * 16}px`
     nodeEl.dataset.path = node.path

2. If node.type === "directory":
     nodeEl.addClass("repo-nav-dir")
     isExpanded = this.expandedPaths.has(node.path)

     // Chevron icon
     chevronEl = nodeEl.createSpan({ cls: "repo-nav-chevron" })
     setIcon(chevronEl, isExpanded ? "chevron-down" : "chevron-right")

     // Folder icon
     iconEl = nodeEl.createSpan({ cls: "repo-nav-icon" })
     setIcon(iconEl, "folder")

     // Directory name
     nodeEl.createSpan({ cls: "repo-nav-name", text: node.name })

     // Click handler: toggle expand/collapse
     nodeEl.addEventListener("click", (e) => {
       e.stopPropagation()
       if isExpanded:
         this.expandedPaths.delete(node.path)
       else:
         this.expandedPaths.add(node.path)
       this.renderView()  // re-render
     })

     // Render children only if expanded (lazy rendering)
     if isExpanded:
       childrenEl = parentEl.createDiv({ cls: "repo-nav-children" })
       for each child of node.children:
         renderNode(childrenEl, child, depth + 1)

3. If node.type === "file":
     nodeEl.addClass("repo-nav-file")

     // Check if this file is currently active
     activeFile = this.app.workspace.getActiveFile()
     if activeFile && activeFile.path === node.path:
       nodeEl.addClass("repo-nav-active")

     // File icon
     iconEl = nodeEl.createSpan({ cls: "repo-nav-icon" })
     setIcon(iconEl, "file-text")

     // File name (extension already stripped in tree-builder)
     nodeEl.createSpan({ cls: "repo-nav-name", text: node.name })

     // Click handler: open file
     nodeEl.addEventListener("click", async (e) => {
       e.stopPropagation()
       file = this.app.vault.getAbstractFileByPath(node.path)
       if file instanceof TFile:
         if e.metaKey || e.ctrlKey:
           // Modifier-click: open in new leaf
           leaf = this.app.workspace.getLeaf("tab")
           await leaf.openFile(file)
         else:
           // Normal click: open in active leaf
           await this.app.workspace.getLeaf(false).openFile(file)
     })
```

#### `debouncedRefresh(): void`

```
1. If debounceTimer exists, clearTimeout(debounceTimer)
2. debounceTimer = setTimeout(() => {
     this.treeData = buildTree(this.app, this.plugin.settings)
     this.renderView()
   }, 300)
```

#### `updateActiveFile(): void`

```
1. Remove "repo-nav-active" class from all file nodes
2. Get current active file path
3. Find the node element with matching data-path
4. Add "repo-nav-active" class to it
```

#### `refreshTree(): void`

```
1. this.treeData = buildTree(this.app, this.plugin.settings)
2. this.renderView()
```

---

## 8. Settings Tab — `src/settings.ts`

### Class: `RepoNavSettingTab extends PluginSettingTab`

| Member | Type | Description |
|--------|------|-------------|
| `plugin` | `RepoNavPlugin` | Reference to the plugin instance |

#### `display(): void`

Renders 5 settings into `this.containerEl`:

**Setting 1: Show hidden directories**
```
new Setting(containerEl)
  .setName("Show hidden directories")
  .setDesc("Include dot-prefixed directories (e.g., .github) in the tree.")
  .addToggle(toggle => toggle
    .setValue(this.plugin.settings.showHiddenDirs)
    .onChange(async (value) => {
      this.plugin.settings.showHiddenDirs = value;
      await this.plugin.saveSettings();
    }))
```

**Setting 2: File extensions**
```
new Setting(containerEl)
  .setName("File extensions")
  .setDesc("Comma-separated list of extensions to include (e.g., .md,.mdx).")
  .addText(text => text
    .setPlaceholder(".md")
    .setValue(this.plugin.settings.fileExtensions)
    .onChange(async (value) => {
      this.plugin.settings.fileExtensions = value;
      await this.plugin.saveSettings();
    }))
```

**Setting 3: Excluded directories**
```
new Setting(containerEl)
  .setName("Excluded directories")
  .setDesc("Comma-separated directory names to always exclude.")
  .addText(text => text
    .setPlaceholder("node_modules,.git")
    .setValue(this.plugin.settings.excludedDirs)
    .onChange(async (value) => {
      this.plugin.settings.excludedDirs = value;
      await this.plugin.saveSettings();
    }))
```

**Setting 4: Sort order**
```
new Setting(containerEl)
  .setName("Sort order")
  .setDesc("How to sort files and directories in the tree.")
  .addDropdown(dropdown => dropdown
    .addOption("folders-first", "Folders first")
    .addOption("az", "Alphabetical (A-Z)")
    .addOption("za", "Alphabetical (Z-A)")
    .setValue(this.plugin.settings.sortOrder)
    .onChange(async (value) => {
      this.plugin.settings.sortOrder = value as RepoNavSettings["sortOrder"];
      await this.plugin.saveSettings();
    }))
```

**Setting 5: Collapse on startup**
```
new Setting(containerEl)
  .setName("Collapse on startup")
  .setDesc("Start with all directories collapsed when opening the view.")
  .addToggle(toggle => toggle
    .setValue(this.plugin.settings.collapseOnStartup)
    .onChange(async (value) => {
      this.plugin.settings.collapseOnStartup = value;
      await this.plugin.saveSettings();
    }))
```

---

## 9. Stylesheet — `styles.css`

```css
/* ── Header ── */
.repo-nav-header {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--background-modifier-border);
}

.repo-nav-header button {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  padding: 4px;
  border-radius: 4px;
}

.repo-nav-header button:hover {
  color: var(--text-normal);
  background: var(--background-modifier-hover);
}

/* ── Tree Container ── */
.repo-nav-tree {
  overflow-y: auto;
  padding: 4px 0;
}

/* ── Node (shared) ── */
.repo-nav-node {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  cursor: pointer;
  border-radius: 4px;
  font-size: var(--font-ui-small);
  color: var(--text-normal);
  user-select: none;
}

.repo-nav-node:hover {
  background: var(--background-modifier-hover);
}

/* ── Directory Node ── */
.repo-nav-dir .repo-nav-name {
  font-weight: 500;
}

/* ── File Node ── */
.repo-nav-file {
  color: var(--text-muted);
}

.repo-nav-file:hover {
  color: var(--text-normal);
}

/* ── Active File ── */
.repo-nav-active {
  background: var(--background-modifier-active-hover);
  color: var(--text-normal);
}

/* ── Icons ── */
.repo-nav-chevron {
  display: flex;
  align-items: center;
  width: 16px;
  flex-shrink: 0;
}

.repo-nav-chevron svg {
  width: 12px;
  height: 12px;
}

.repo-nav-icon {
  display: flex;
  align-items: center;
  width: 16px;
  flex-shrink: 0;
}

.repo-nav-icon svg {
  width: 14px;
  height: 14px;
}

.repo-nav-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Children Container ── */
.repo-nav-children {
  /* No extra styles needed; indentation handled via paddingLeft */
}

/* ── Empty State ── */
.repo-nav-empty {
  padding: 16px;
  text-align: center;
  color: var(--text-faint);
  font-size: var(--font-ui-small);
}
```

---

## 10. Event Flow

### 10.1 Plugin Initialization

```
Obsidian loads plugin
  → onload()
    → loadSettings()
    → registerView(VIEW_TYPE_REPO_NAV)
    → addRibbonIcon()
    → addCommand()
    → addSettingTab()
    → onLayoutReady → activateView()
      → getLeftLeaf() → setViewState()
        → RepoNavTreeView.onOpen()
          → buildTree()
          → renderView()
          → register vault events (create/delete/rename)
          → register workspace event (active-leaf-change)
```

### 10.2 File System Change

```
Vault event (create/delete/rename)
  → debouncedRefresh() [300ms]
    → buildTree()
    → renderView()
```

### 10.3 User Clicks Directory

```
Click on directory node
  → toggle expandedPaths set
  → renderView()
    → children rendered or hidden based on expanded state
```

### 10.4 User Clicks File

```
Click on file node
  → getAbstractFileByPath()
  → if metaKey/ctrlKey: getLeaf("tab").openFile()
  → else: getLeaf(false).openFile()
```

### 10.5 Settings Changed

```
User modifies setting
  → plugin.saveSettings()
    → saveData()
    → notify active tree view
      → refreshTree()
        → buildTree() with new settings
        → renderView()
```

### 10.6 Active File Changed

```
Workspace "active-leaf-change" event
  → updateActiveFile()
    → remove .repo-nav-active from all nodes
    → find node matching active file path
    → add .repo-nav-active
```

---

## 11. Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Vault has zero `.md` files | Show empty state: "No Markdown files found in this vault." |
| Hidden dir with nested `.md` file (e.g., `.github/workflows/README.md`) | Show `.github` → `workflows` → `README` |
| File extension includes dot-only input (e.g., ".") | Ignore invalid entries; only process valid extensions |
| Very deep nesting (20+ levels) | Render normally; indentation may push content off-screen (CSS overflow handles scroll) |
| Rapidly created/deleted files (e.g., `git checkout` switching branches) | 300ms debounce batches all changes into a single tree rebuild |
| Directory name matches excluded dir at any depth (e.g., `src/node_modules/`) | Exclude only top-level name matches; `src/node_modules/` is excluded because `node_modules` is in the exclusion list |
| File with multiple dots (e.g., `file.test.md`) | Extension check uses `endsWith(".md")`, so it matches correctly. Display name: `file.test` |
| Settings field is empty string | Use empty array for extensions (shows nothing) or empty set for exclusions (excludes nothing) |
| Same directory open in multiple panes | Single tree instance; active highlight follows last-focused pane |

---

## 12. Implementation Checklist

| # | File | Task | Status |
|---|------|------|--------|
| 1 | `manifest.json` | Create with plugin metadata | Pending |
| 2 | `package.json` | Create with dependencies and scripts | Pending |
| 3 | `tsconfig.json` | Create TypeScript config | Pending |
| 4 | `esbuild.config.mjs` | Create build script | Pending |
| 5 | `src/types.ts` | Define TreeNode and RepoNavSettings interfaces | Pending |
| 6 | `src/constants.ts` | Define VIEW_TYPE, DEFAULT_SETTINGS, ICON_ID | Pending |
| 7 | `src/main.ts` | Plugin class with lifecycle, commands, ribbon | Pending |
| 8 | `src/settings.ts` | PluginSettingTab with 5 settings | Pending |
| 9 | `src/tree-builder.ts` | buildTree, sortTree, parse helpers | Pending |
| 10 | `src/tree-view.ts` | ItemView with render, events, debounce | Pending |
| 11 | `styles.css` | All CSS classes for tree UI | Pending |
| 12 | — | Manual QA: small vault, large vault, hidden dirs | Pending |
