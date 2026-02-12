import { App, DataAdapter } from "obsidian";
import { TreeNode, RepoNavSettings } from "./types";

export function parseExtensions(input: string): string[] {
  if (!input.trim()) return [];
  return input
    .split(",")
    .map((ext) => ext.trim())
    .filter((ext) => ext.length > 0)
    .map((ext) => (ext.startsWith(".") ? ext : "." + ext));
}

export function parseExcludedDirs(input: string): Set<string> {
  if (!input.trim()) return new Set();
  return new Set(
    input
      .split(",")
      .map((dir) => dir.trim())
      .filter((dir) => dir.length > 0)
  );
}

function sortTree(node: TreeNode, order: RepoNavSettings["sortOrder"]): void {
  if (node.type === "file") return;

  for (const child of node.children) {
    sortTree(child, order);
  }

  switch (order) {
    case "folders-first":
      node.children.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "directory" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      break;
    case "az":
      node.children.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "za":
      node.children.sort((a, b) => b.name.localeCompare(a.name));
      break;
  }
}

async function scanDirectory(
  adapter: DataAdapter,
  dirPath: string,
  extensions: string[],
  excludedSet: Set<string>,
  showHiddenDirs: boolean
): Promise<string[]> {
  const files: string[] = [];
  try {
    const listing = await adapter.list(dirPath);

    for (const filePath of listing.files) {
      if (extensions.some((ext) => filePath.endsWith(ext))) {
        files.push(filePath);
      }
    }

    for (const folderPath of listing.folders) {
      const folderName = folderPath.split("/").pop() || "";
      if (excludedSet.has(folderName)) continue;
      if (!showHiddenDirs && folderName.startsWith(".")) continue;
      const subFiles = await scanDirectory(
        adapter,
        folderPath,
        extensions,
        excludedSet,
        showHiddenDirs
      );
      files.push(...subFiles);
    }
  } catch {
    // Ignore inaccessible directories
  }
  return files;
}

export async function buildTree(
  app: App,
  settings: RepoNavSettings
): Promise<TreeNode> {
  const extensions = parseExtensions(settings.fileExtensions);
  const excludedSet = parseExcludedDirs(settings.excludedDirs);

  const root: TreeNode = {
    name: "/",
    path: "",
    type: "directory",
    children: [],
  };

  if (extensions.length === 0) return root;

  const nodeMap = new Map<string, TreeNode>();
  nodeMap.set("", root);

  let filePaths: string[];

  if (settings.showHiddenDirs) {
    // Full vault scan via adapter to include hidden dirs at every level
    filePaths = await scanDirectory(
      app.vault.adapter,
      "",
      extensions,
      excludedSet,
      true
    );
  } else {
    // Use Obsidian's indexed files (faster, already excludes hidden dirs)
    const allFiles = app.vault.getFiles();
    filePaths = allFiles
      .filter((f) => extensions.some((ext) => f.path.endsWith(ext)))
      .map((f) => f.path);
  }

  for (const filePath of filePaths) {
    const segments = filePath.split("/");
    const fileName = segments.pop()!;
    let currentPath = "";
    let skipped = false;

    for (const segment of segments) {
      const parentPath = currentPath;
      currentPath = currentPath ? currentPath + "/" + segment : segment;

      if (excludedSet.has(segment)) {
        skipped = true;
        break;
      }

      if (!settings.showHiddenDirs && segment.startsWith(".")) {
        skipped = true;
        break;
      }

      if (!nodeMap.has(currentPath)) {
        const dirNode: TreeNode = {
          name: segment,
          path: currentPath,
          type: "directory",
          children: [],
        };
        nodeMap.set(currentPath, dirNode);
        const parentNode = nodeMap.get(parentPath)!;
        parentNode.children.push(dirNode);
      }
    }

    if (!skipped) {
      const displayName = fileName.replace(/\.[^.]+$/, "");
      const fileNode: TreeNode = {
        name: displayName,
        path: filePath,
        type: "file",
        children: [],
      };
      const parentNode = nodeMap.get(currentPath)!;
      parentNode.children.push(fileNode);
    }
  }

  sortTree(root, settings.sortOrder);

  return root;
}
