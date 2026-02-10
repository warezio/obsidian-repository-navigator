import { ItemView, WorkspaceLeaf, TFile, setIcon } from "obsidian";
import type RepoNavPlugin from "./main";
import { VIEW_TYPE_REPO_NAV, ICON_ID } from "./constants";
import { TreeNode } from "./types";
import { buildTree } from "./tree-builder";

export class RepoNavTreeView extends ItemView {
  plugin: RepoNavPlugin;
  treeData: TreeNode | null = null;
  expandedPaths: Set<string> = new Set();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: RepoNavPlugin) {
    super(leaf);
    this.plugin = plugin;
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
    this.treeData = buildTree(this.app, this.plugin.settings);

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

  refreshTree(): void {
    this.treeData = buildTree(this.app, this.plugin.settings);
    this.renderView();
  }
}
