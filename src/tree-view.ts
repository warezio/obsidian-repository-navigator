import { ItemView, WorkspaceLeaf, TFile, setIcon } from "obsidian";
import type RepoNavPlugin from "./main";
import { VIEW_TYPE_REPO_NAV, ICON_ID } from "./constants";
import { TreeNode } from "./types";
import { buildTree } from "./tree-builder";

interface ContextMenuAction {
  label: string;
  icon: string;
  action: () => void;
}

class ContextMenu {
  private menuEl: HTMLElement | null = null;
  private closeCallback: (() => void) | null = null;

  constructor(private document: Document) {
    this.setupGlobalClickListener();
  }

  show(x: number, y: number, actions: ContextMenuAction[]): void {
    this.hide();

    const menuEl = this.document.createElement("div");
    menuEl.addClass("repo-nav-context-menu");

    for (const action of actions) {
      const itemEl = menuEl.createDiv({ cls: "repo-nav-context-menu-item" });
      itemEl.createSpan({ cls: "repo-nav-context-menu-icon" });
      setIcon(itemEl, action.icon);
      itemEl.createSpan({ text: action.label });
      itemEl.addEventListener("click", (e) => {
        e.stopPropagation();
        action.action();
        this.hide();
      });
    }

    this.document.body.appendChild(menuEl);

    // Position menu at cursor with boundary detection
    const menuWidth = 150;
    const itemHeight = 36;
    const menuHeight = actions.length * itemHeight + 8;

    let posX = x;
    let posY = y;

    if (posX + menuWidth > this.document.body.clientWidth) {
      posX = this.document.body.clientWidth - menuWidth - 8;
    }

    if (posY + menuHeight > this.document.body.clientHeight) {
      posY = this.document.body.clientHeight - menuHeight - 8;
    }

    menuEl.style.left = `${posX}px`;
    menuEl.style.top = `${posY}px`;

    this.menuEl = menuEl;
  }

  hide(): void {
    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
    }
  }

  private setupGlobalClickListener(): void {
    this.document.addEventListener("click", () => {
      this.hide();
    });
  }
}

export class RepoNavTreeView extends ItemView {
  plugin: RepoNavPlugin;
  treeData: TreeNode | null = null;
  expandedPaths: Set<string> = new Set();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private contextMenu: ContextMenu;

  constructor(leaf: WorkspaceLeaf, plugin: RepoNavPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.contextMenu = new ContextMenu(this.containerEl.ownerDocument);
  }

  getViewType(): string {
    return VIEW_TYPE_REPO_NAV;
  }

  getDisplayText(): string {
    return "Repository Navigator";
  }

  getIcon(): string {
    return ICON_ID;
  }

  async onOpen(): Promise<void> {
    this.expandedPaths = new Set();
    this.treeData = await buildTree(this.app, this.plugin.settings);

    if (!this.plugin.settings.collapseOnStartup && this.treeData) {
      for (const child of this.treeData.children) {
        if (child.type === "directory") {
          this.expandedPaths.add(child.path);
        }
      }
    }

    this.renderView();

    this.registerEvent(
      this.app.vault.on("create", () => this.debouncedRefresh())
    );
    this.registerEvent(
      this.app.vault.on("delete", () => this.debouncedRefresh())
    );
    this.registerEvent(
      this.app.vault.on("rename", () => this.debouncedRefresh())
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () =>
        this.updateActiveFile()
      )
    );
  }

  async onClose(): Promise<void> {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
  }

  private expandAll(folderPath: string): void {
    const node = this.findNode(this.treeData, folderPath);
    if (node) {
      const paths = this.collectDescendantPaths(node);
      for (const path of paths) {
        this.expandedPaths.add(path);
      }
      this.renderView();
    }
  }

  private collapseAll(folderPath: string): void {
    const node = this.findNode(this.treeData, folderPath);
    if (node) {
      const paths = this.collectDescendantPaths(node);
      for (const path of paths) {
        this.expandedPaths.delete(path);
      }
      this.renderView();
    }
  }

  private findNode(root: TreeNode | null, path: string): TreeNode | null {
    if (!root) return null;
    if (root.path === path) return root;

    for (const child of root.children) {
      const found = this.findNode(child, path);
      if (found) return found;
    }
    return null;
  }

  private collectDescendantPaths(node: TreeNode): string[] {
    const paths: string[] = [];
    if (node.type === "directory") {
      paths.push(node.path);
      for (const child of node.children) {
        paths.push(...this.collectDescendantPaths(child));
      }
    }
    return paths;
  }

  renderView(): void {
    this.contentEl.empty();

    const headerEl = this.contentEl.createDiv({ cls: "repo-nav-header" });

    const allDirPaths = this.collectAllDirPaths(this.treeData);
    const isAllExpanded = allDirPaths.size > 0 && allDirPaths.size === this.expandedPaths.size;

    const toggleBtn = headerEl.createEl("button", {
      attr: { "aria-label": isAllExpanded ? "Collapse all" : "Expand all" },
    });
    setIcon(toggleBtn, isAllExpanded ? "chevrons-down-up" : "chevrons-up-down");
    toggleBtn.addEventListener("click", () => {
      if (isAllExpanded) {
        this.expandedPaths.clear();
      } else {
        for (const p of allDirPaths) {
          this.expandedPaths.add(p);
        }
      }
      this.renderView();
    });

    const refreshBtn = headerEl.createEl("button", {
      attr: { "aria-label": "Refresh" },
    });
    setIcon(refreshBtn, "refresh-cw");
    refreshBtn.addEventListener("click", () => {
      this.refreshTree();
    });

    const treeEl = this.contentEl.createDiv({ cls: "repo-nav-tree" });

    if (
      !this.treeData ||
      this.treeData.children.length === 0
    ) {
      treeEl.createDiv({
        cls: "repo-nav-empty",
        text: "No Markdown files found in this vault.",
      });
      return;
    }

    for (const child of this.treeData.children) {
      this.renderNode(treeEl, child, 0);
    }
  }

  private renderNode(
    parentEl: HTMLElement,
    node: TreeNode,
    depth: number
  ): void {
    const nodeEl = parentEl.createDiv({ cls: "repo-nav-node" });
    nodeEl.style.paddingLeft = `${depth * 16}px`;
    nodeEl.dataset.path = node.path;

    if (node.type === "directory") {
      nodeEl.addClass("repo-nav-dir");
      const isExpanded = this.expandedPaths.has(node.path);

      const chevronEl = nodeEl.createSpan({ cls: "repo-nav-chevron" });
      setIcon(chevronEl, isExpanded ? "chevron-down" : "chevron-right");

      const iconEl = nodeEl.createSpan({ cls: "repo-nav-icon" });
      setIcon(iconEl, "folder");

      nodeEl.createSpan({ cls: "repo-nav-name", text: node.name });

      nodeEl.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.expandedPaths.has(node.path)) {
          this.expandedPaths.delete(node.path);
        } else {
          this.expandedPaths.add(node.path);
        }
        this.renderView();
      });

      nodeEl.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.contextMenu.show(e.clientX, e.clientY, [
          {
            label: "Expand All",
            icon: "chevrons-up-down",
            action: () => this.expandAll(node.path),
          },
          {
            label: "Collapse All",
            icon: "chevrons-down-up",
            action: () => this.collapseAll(node.path),
          },
        ]);
      });

      if (isExpanded) {
        const childrenEl = parentEl.createDiv({ cls: "repo-nav-children" });
        for (const child of node.children) {
          this.renderNode(childrenEl, child, depth + 1);
        }
      }
    } else {
      nodeEl.addClass("repo-nav-file");

      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile && activeFile.path === node.path) {
        nodeEl.addClass("repo-nav-active");
      }

      const iconEl = nodeEl.createSpan({ cls: "repo-nav-icon" });
      setIcon(iconEl, "file-text");

      nodeEl.createSpan({ cls: "repo-nav-name", text: node.name });

      nodeEl.addEventListener("click", async (e) => {
        e.stopPropagation();
        const file = this.app.vault.getAbstractFileByPath(node.path);
        if (file instanceof TFile) {
          if (e.metaKey || e.ctrlKey) {
            const leaf = this.app.workspace.getLeaf("tab");
            await leaf.openFile(file);
          } else {
            await this.app.workspace.getLeaf(false).openFile(file);
          }
        }
      });
    }
  }

  private collectAllDirPaths(node: TreeNode | null): Set<string> {
    const paths = new Set<string>();
    if (!node) return paths;
    const walk = (n: TreeNode) => {
      if (n.type === "directory" && n.path) {
        paths.add(n.path);
      }
      for (const child of n.children) {
        walk(child);
      }
    };
    walk(node);
    return paths;
  }

  private debouncedRefresh(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.refreshTree();
    }, 300);
  }

  updateActiveFile(): void {
    const activeFile = this.app.workspace.getActiveFile();
    const allNodes = this.containerEl.querySelectorAll(".repo-nav-file");
    allNodes.forEach((el) => el.removeClass("repo-nav-active"));

    if (activeFile) {
      const match = this.containerEl.querySelector(
        `.repo-nav-file[data-path="${CSS.escape(activeFile.path)}"]`
      );
      if (match) {
        match.addClass("repo-nav-active");
      }
    }
  }

  async refreshTree(): Promise<void> {
    this.treeData = await buildTree(this.app, this.plugin.settings);
    this.renderView();
  }
}
