# Archive Index - February 2026

## Completed Features

| Feature | Status | Match Rate | Archived Date |
|---------|--------|------------|--------------|
| [context-menu-folders](./context-menu-folders/) | ✅ Completed | 98% | 2026-02-12 |
| [fix-hidden-dirs-visibility](./fix-hidden-dirs-visibility/) | ✅ Completed (bugfix) | N/A | 2026-02-12 |

---

## context-menu-folders

**Summary**: Right-click context menu for folders with Expand All and Collapse All actions

**Documents**:
- [Plan](./context-menu-folders/context-menu-folders.plan.md)
- [Design](./context-menu-folders/context-menu-folders.design.md)
- [Analysis](./context-menu-folders/context-menu-folders.analysis.md)
- [Report](./context-menu-folders/context-menu-folders.report.md)

---

## fix-hidden-dirs-visibility

**Summary**: Bug fix - Hidden directories (`.github`, `.obsidian`, etc.) were not visible due to Obsidian's `vault.getFiles()` API limitation. Fixed by using `adapter.list()` for direct filesystem scanning.

**Documents**:
- [Report](./fix-hidden-dirs-visibility/fix-hidden-dirs-visibility.report.md)
