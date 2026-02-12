import { RepoNavSettings } from "./types";

export const VIEW_TYPE_REPO_NAV = "repo-nav-tree-view";
export const VIEW_TYPE_HIDDEN_FILE = "repo-nav-hidden-file";

export const DEFAULT_SETTINGS: RepoNavSettings = {
  showHiddenDirs: true,
  fileExtensions: ".md",
  excludedDirs: "node_modules,.git",
  sortOrder: "folders-first",
  collapseOnStartup: false,
};

export const ICON_ID = "folder-tree";
