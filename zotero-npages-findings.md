# Findings for `zotero-npages`

This note captures what to reuse from `zotero-ntags` to build a sibling plugin
called `zotero-npages`. The feature should expose the total page count of
attached PDF files as:

- a sortable item-tree column
- an Advanced Search condition

## Repository Shape

Start from the same Zotero Plugin Template scaffold used for `zotero-ntags`.
Use these package settings:

```json
{
  "name": "zotero-npages",
  "config": {
    "addonName": "NPages",
    "addonID": "zotero-npages@nexdep.com",
    "addonRef": "npages",
    "addonInstance": "NPages",
    "prefsPrefix": "extensions.zotero.npages"
  },
  "repository": {
    "url": "git+https://github.com/nexdep/zotero-npages.git"
  }
}
```

Keep the Zotero compatibility range that works for current Zotero:

```json
"strict_min_version": "6.999",
"strict_max_version": "9.0.*"
```

## Zotero Internals

Relevant Zotero source locations inspected:

- `chrome/content/zotero/xpcom/fulltext.js`
- `chrome/content/zotero/elements/attachmentBox.js`
- `chrome/content/zotero/xpcom/schema.js`
- `chrome/content/zotero/xpcom/data/item.js`
- `chrome/content/zotero/xpcom/data/search.js`
- `chrome/content/zotero/xpcom/data/searchConditions.js`
- `chrome/content/zotero/xpcom/pluginAPI/itemTreeManager.js`

The useful page-count source is `fulltextItems.totalPages`.

Zotero populates this value while indexing PDFs:

```js
const { text, extractedPages, totalPages } =
  await Zotero.PDFWorker.getFullText(itemID, allPages ? null : maxPages);

const stats = { indexedPages: extractedPages, totalPages };
await indexString(text, itemID, stats);
```

Zotero's attachment info pane already displays PDF page counts by calling:

```js
Zotero.Fulltext.getPages(this.item.id).then((pages) => {
  pages = pages ? pages.total : null;
});
```

`Zotero.Fulltext.getPages(itemID)` runs:

```sql
SELECT indexedPages, totalPages AS total
FROM fulltextItems
WHERE itemID = ?
```

Important caveat: page totals are available only after Zotero has processed or
indexed the PDF. A PDF with no `fulltextItems.totalPages` row should be treated
as `0` or blank in the first plugin version.

## Data Model

PDF attachments are rows in `itemAttachments`:

```sql
itemAttachments(
  itemID INTEGER PRIMARY KEY,
  parentItemID INT,
  contentType TEXT,
  ...
)
```

A PDF attachment is identified by:

```sql
itemAttachments.contentType = 'application/pdf'
```

For the item-tree column, define page count as:

- for a regular parent item: sum of `totalPages` for child PDF attachments
- for a PDF attachment row: that attachment's own `totalPages`
- for items without known PDF page totals: `0`

## Search SQL

The Advanced Search condition can follow the `zotero-ntags` approach: patch
`Zotero.SearchConditions` at runtime and expose a condition backed by a SQL
field expression. Use `table: "items"` so Zotero's existing search builder can
apply numeric operators.

Recommended field expression:

```ts
const PAGE_COUNT_SQL_FIELD = `
  CAST((
    COALESCE((
      SELECT FI.totalPages
      FROM itemAttachments IA
      LEFT JOIN fulltextItems FI ON FI.itemID = IA.itemID
      WHERE IA.itemID = items.itemID
        AND IA.contentType = 'application/pdf'
    ), 0)
    +
    COALESCE((
      SELECT SUM(FI.totalPages)
      FROM itemAttachments IA
      LEFT JOIN fulltextItems FI ON FI.itemID = IA.itemID
      WHERE IA.parentItemID = items.itemID
        AND IA.contentType = 'application/pdf'
    ), 0)
  ) AS TEXT)
`;
```

This supports both attachment rows and regular parent item rows. Casting to
`TEXT` mirrors `zotero-ntags` and works with Zotero's search builder for
`isLessThan` and `isGreaterThan`, because Zotero casts numeric-condition fields
back to integers internally.

Condition definition:

```ts
const pageCountSearchCondition = {
  name: "pageCount",
  operators: {
    is: true,
    isNot: true,
    isLessThan: true,
    isGreaterThan: true,
  },
  table: "items",
  field: PAGE_COUNT_SQL_FIELD,
  special: false,
};
```

Suggested UI label: `PDF Pages`.

## Item-Tree Column

`Zotero.ItemTreeManager.registerColumn()` is the same API used by
`zotero-ntags`.

The important difference: `zotero-ntags` can compute tags synchronously with
`item.getTags()`. PDF page totals require DB access through async APIs such as
`Zotero.Fulltext.getPages()` or `Zotero.DB.queryAsync()`. The item-tree
`dataProvider` is synchronous, so `zotero-npages` needs a small cache.

Recommended cache strategy:

1. Keep `Map<number, number>` keyed by Zotero item ID.
2. Populate it at startup with one async query.
3. Use the synchronous `dataProvider` to read from the map.
4. Refresh the cache on notifier events for `item` changes and on startup.

Startup cache query:

```sql
SELECT itemID, SUM(pages) AS pages
FROM (
  SELECT IA.itemID AS itemID, COALESCE(FI.totalPages, 0) AS pages
  FROM itemAttachments IA
  LEFT JOIN fulltextItems FI ON FI.itemID = IA.itemID
  WHERE IA.contentType = 'application/pdf'

  UNION ALL

  SELECT IA.parentItemID AS itemID, COALESCE(FI.totalPages, 0) AS pages
  FROM itemAttachments IA
  LEFT JOIN fulltextItems FI ON FI.itemID = IA.itemID
  WHERE IA.contentType = 'application/pdf'
    AND IA.parentItemID IS NOT NULL
)
GROUP BY itemID
```

TypeScript shape:

```ts
const PAGE_COUNT_COLUMN_KEY = "pdfPageCount";
const PAGE_COUNT_LABEL = "PDF Pages";
const PAGE_COUNT_SORT_WIDTH = 10;

let pageCounts = new Map<number, number>();

async function refreshPageCounts() {
  const rows = await Zotero.DB.queryAsync(PAGE_COUNT_CACHE_SQL);
  pageCounts = new Map(
    rows.map((row) => [Number(row.itemID), Number(row.pages) || 0]),
  );
}

function getItemPDFPageCount(item: Zotero.Item): number {
  return pageCounts.get(item.id) || 0;
}

function getSortablePDFPageCount(item: Zotero.Item): string {
  return String(getItemPDFPageCount(item)).padStart(PAGE_COUNT_SORT_WIDTH, "0");
}
```

Column registration:

```ts
Zotero.ItemTreeManager.registerColumn({
  pluginID: addon.data.config.addonID,
  dataKey: PAGE_COUNT_COLUMN_KEY,
  label: PAGE_COUNT_LABEL,
  enabledTreeIDs: ["main", "advanced-search"],
  width: "90",
  minWidth: 70,
  showInColumnPicker: true,
  dataProvider: (item: Zotero.Item) => getSortablePDFPageCount(item),
  renderCell: (_index, data, column, _isFirstColumn, doc) => {
    const cell = doc.createElement("span");
    cell.className = `cell ${column.className}`;
    cell.textContent = String(Number(data));
    return cell;
  },
  zoteroPersist: ["width", "hidden", "sortDirection"],
});
```

The zero-padding is needed because custom columns are sorted by string
comparison. Rendering `Number(data)` keeps the user-facing value normal.

## Runtime Hooks

Reuse the simplified `zotero-ntags` hook layout:

- `onStartup`
  - wait for Zotero initialization promises
  - initialize the page-count cache
  - patch search conditions
  - register the item-tree column
  - register a notifier to refresh page counts
- `onShutdown`
  - unregister the custom column
  - restore patched search-condition methods
  - unregister notifiers
  - delete `Zotero.NPages`

Notifier guidance:

```ts
const notifierID = Zotero.Notifier.registerObserver(
  {
    notify: async (event, type) => {
      if (type !== "item") return;
      if (!["add", "modify", "delete", "refresh"].includes(event)) return;
      await refreshPageCounts();
      Zotero.ItemTreeManager.refreshColumns();
    },
  },
  ["item"],
);
```

The notifier may not catch every full-text indexing update immediately, because
`fulltextItems` is not itself an item data type exposed as a normal item field.
If instant updates after indexing are required, add a manual refresh command or
refresh the cache when main windows load. For a first release, startup refresh
plus item-change refresh is likely enough.

## Advanced Search Patch

Copy the `installTagNumberSearchCondition()` pattern from
`src/modules/tagNumber.ts` and rename it to something like
`installPDFPageCountSearchCondition()`.

Use safe restore behavior: restore Zotero methods only if they still point to
this plugin's wrappers. This avoids undoing another plugin's later patch.

Suggested condition identifiers:

```ts
const PAGE_COUNT_COLUMN_KEY = "pdfPageCount";
const PAGE_COUNT_LABEL = "PDF Pages";
```

Use the same operators as `zotero-ntags`:

- `is`
- `isNot`
- `isLessThan`
- `isGreaterThan`

## Edge Cases

- Multiple attached PDFs: sum their page totals on the parent row.
- Standalone PDF attachment: show its own page total.
- Child PDF attachment displayed in an expanded item tree: show its own page
  total.
- Missing or unindexed PDF: display `0` in the first version.
- Non-PDF attachments: ignored.
- Metadata item `numPages`: do not use it. It is bibliographic metadata and may
  not match attached PDFs.
- PDF page counts come from Zotero full-text indexing, not direct PDF parsing in
  the plugin. Avoid adding a PDF parser unless page counts must appear before
  Zotero indexes the file.

## Files to Create or Rename

Main implementation file:

```text
src/modules/pdfPageCount.ts
```

Minimal hook imports:

```ts
import {
  installPDFPageCountSearchCondition,
  registerPDFPageCountColumn,
  refreshPDFPageCounts,
} from "./modules/pdfPageCount";
```

Recommended README acknowledgement:

```md
This plugin is built from the
[Zotero Plugin Template](https://github.com/windingwind/zotero-plugin-template)
project.
```

## Verification Checklist

Before release:

```sh
npm run lint:check
npm run build
unzip -p .scaffold/build/n-pages.xpi manifest.json
```

Manual Zotero checks:

1. Install the XPI in Zotero 9.0.x.
2. Enable the `PDF Pages` column from the item-tree column picker.
3. Confirm an item with one indexed PDF shows that PDF's total page count.
4. Confirm an item with multiple indexed PDFs shows the sum.
5. Confirm sorting orders `2`, `10`, `100` numerically, not lexicographically.
6. Open Advanced Search and confirm `PDF Pages` appears as a condition.
7. Test `PDF Pages is greater than 20`.
8. Test `PDF Pages is 0` for items without known indexed PDFs.

## Release Flow

Use the same tag-based workflow:

```sh
git tag v0.1.0
git push origin main
git push origin v0.1.0
```

The template release workflow should generate the XPI and update metadata on
GitHub Releases.
