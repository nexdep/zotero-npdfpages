const PDF_PAGE_COUNT_COLUMN_KEY = "pdfPageCount";
const PDF_PAGE_COUNT_LABEL = "PDF Pages";
const PDF_PAGE_COUNT_SORT_WIDTH = 10;
const PDF_PAGE_COUNT_REFRESH_EVENTS = new Set([
  "add",
  "modify",
  "delete",
  "refresh",
]);
const PDF_PAGE_COUNT_SQL_FIELD = `
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
const PDF_PAGE_COUNT_CACHE_SQL = `
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
`;

type PageCountRow = {
  itemID: number | string;
  pages: number | string | null;
};

type SearchConditionsAPI = {
  get: (condition: string) => any;
  getStandardConditions: () => Array<{
    flags?: Record<string, unknown>;
    localized: string;
    name: string;
    operators?: Record<string, boolean>;
  }>;
  getLocalizedName: (condition: string) => string;
  hasOperator: (condition: string, operator: string) => boolean;
  parseCondition: (condition: string) => [string, string | false];
};

let pdfPageCounts = new Map<number, number>();

const pdfPageCountSearchCondition = {
  name: PDF_PAGE_COUNT_COLUMN_KEY,
  operators: {
    is: true,
    isNot: true,
    isLessThan: true,
    isGreaterThan: true,
  },
  table: "items",
  field: PDF_PAGE_COUNT_SQL_FIELD,
  special: false,
};

export async function refreshPDFPageCounts(): Promise<void> {
  const result = await Zotero.DB.queryAsync(PDF_PAGE_COUNT_CACHE_SQL);
  const rows = Array.isArray(result) ? (result as PageCountRow[]) : [];

  pdfPageCounts = new Map(
    rows.map((row) => [Number(row.itemID), Number(row.pages) || 0]),
  );
}

export function clearPDFPageCounts(): void {
  pdfPageCounts = new Map();
}

export function getItemPDFPageCount(item: unknown): number {
  const id = (item as { id?: unknown } | null)?.id;
  if (typeof id !== "number") {
    return 0;
  }

  return pdfPageCounts.get(id) || 0;
}

export function getSortablePDFPageCount(item: unknown): string {
  return String(getItemPDFPageCount(item)).padStart(
    PDF_PAGE_COUNT_SORT_WIDTH,
    "0",
  );
}

export function registerPDFPageCountColumn(): string | false {
  const registeredDataKey = Zotero.ItemTreeManager.registerColumn({
    pluginID: addon.data.config.addonID,
    dataKey: PDF_PAGE_COUNT_COLUMN_KEY,
    label: PDF_PAGE_COUNT_LABEL,
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

  Zotero.ItemTreeManager.refreshColumns();
  return registeredDataKey;
}

export function registerPDFPageCountNotifier(): string {
  return Zotero.Notifier.registerObserver(
    {
      notify: async (event, type) => {
        if (type !== "item" || !PDF_PAGE_COUNT_REFRESH_EVENTS.has(event)) {
          return;
        }

        await refreshPDFPageCounts();
        Zotero.ItemTreeManager.refreshColumns();
      },
    },
    ["item"],
    "npdfpages-page-count",
  );
}

export function installPDFPageCountSearchCondition(): () => void {
  const searchConditions = Zotero.SearchConditions as SearchConditionsAPI & {
    __npdfpagesPDFPageCountInstalled?: boolean;
  };

  if (searchConditions.__npdfpagesPDFPageCountInstalled) {
    return () => undefined;
  }

  const original = {
    get: searchConditions.get,
    getStandardConditions: searchConditions.getStandardConditions,
    getLocalizedName: searchConditions.getLocalizedName,
    hasOperator: searchConditions.hasOperator,
    parseCondition: searchConditions.parseCondition,
  };

  const patchedGet = function (condition: string) {
    const [conditionName] = original.parseCondition.call(
      searchConditions,
      condition,
    );
    if (conditionName === PDF_PAGE_COUNT_COLUMN_KEY) {
      return pdfPageCountSearchCondition;
    }
    return original.get.call(searchConditions, condition);
  };
  searchConditions.get = patchedGet;

  const patchedGetStandardConditions = function () {
    const conditions = original.getStandardConditions
      .call(searchConditions)
      .filter((condition) => condition.name !== PDF_PAGE_COUNT_COLUMN_KEY);

    conditions.push({
      name: PDF_PAGE_COUNT_COLUMN_KEY,
      localized: PDF_PAGE_COUNT_LABEL,
      operators: pdfPageCountSearchCondition.operators,
    });

    const collation = Zotero.getLocaleCollation() as unknown as {
      compareString: (strength: number, a: string, b: string) => number;
    };
    return conditions.sort((a, b) => {
      if (a.name === "anyField") {
        return -1;
      }
      if (b.name === "anyField") {
        return 1;
      }
      return collation.compareString(1, a.localized, b.localized);
    });
  };
  searchConditions.getStandardConditions = patchedGetStandardConditions;

  const patchedGetLocalizedName = function (condition: string) {
    if (condition === PDF_PAGE_COUNT_COLUMN_KEY) {
      return PDF_PAGE_COUNT_LABEL;
    }
    return original.getLocalizedName.call(searchConditions, condition);
  };
  searchConditions.getLocalizedName = patchedGetLocalizedName;

  const patchedHasOperator = function (condition: string, operator: string) {
    const [conditionName] = original.parseCondition.call(
      searchConditions,
      condition,
    );
    if (conditionName === PDF_PAGE_COUNT_COLUMN_KEY) {
      return !!pdfPageCountSearchCondition.operators[
        operator as keyof typeof pdfPageCountSearchCondition.operators
      ];
    }
    return original.hasOperator.call(searchConditions, condition, operator);
  };
  searchConditions.hasOperator = patchedHasOperator;

  searchConditions.__npdfpagesPDFPageCountInstalled = true;

  return () => {
    if (searchConditions.get === patchedGet) {
      searchConditions.get = original.get;
    }
    if (
      searchConditions.getStandardConditions === patchedGetStandardConditions
    ) {
      searchConditions.getStandardConditions = original.getStandardConditions;
    }
    if (searchConditions.getLocalizedName === patchedGetLocalizedName) {
      searchConditions.getLocalizedName = original.getLocalizedName;
    }
    if (searchConditions.hasOperator === patchedHasOperator) {
      searchConditions.hasOperator = original.hasOperator;
    }
    delete searchConditions.__npdfpagesPDFPageCountInstalled;
  };
}
