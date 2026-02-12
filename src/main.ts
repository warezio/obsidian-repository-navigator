import { Plugin, WorkspaceLeaf } from "obsidian";
import { RepoNavSettings } from "./types";
import { VIEW_TYPE_REPO_NAV, DEFAULT_SETTINGS, ICON_ID } from "./constants";
import { RepoNavSettingTab } from "./settings";
import { RepoNavTreeView } from "./tree-view";

export default class RepoNavPlugin extends Plugin {
  settings: RepoNavSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(
      VIEW_TYPE_REPO_NAV,
      (leaf: WorkspaceLeaf) => new RepoNavTreeView(leaf, this)
    );

    this.addRibbonIcon(ICON_ID, "Repository Navigator", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-repo-nav",
      name: "Open tree view",
      callback: () => {
        this.activateView();
      },
    });

    this.addSettingTab(new RepoNavSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      this.activateView();
    });
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_REPO_NAV);
  }

  async activateView(): Promise<void> {
    const existing =
      this.app.workspace.getLeavesOfType(VIEW_TYPE_REPO_NAV);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = this.app.workspace.getLeftLeaf(false);
    if (leaf) {
      await leaf.setViewState({
        type: VIEW_TYPE_REPO_NAV,
        active: true,
      });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  async loadSettings(): Promise<void> {
    const savedData = await this.loadData();
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      savedData
    );
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);

    const leaves =
      this.app.workspace.getLeavesOfType(VIEW_TYPE_REPO_NAV);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof RepoNavTreeView) {
        await view.refreshTree();
      }
    }
  }
}
