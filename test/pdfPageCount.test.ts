import { assert } from "chai";
import {
  clearPDFPageCounts,
  getItemPDFPageCount,
  getSortablePDFPageCount,
  refreshPDFPageCounts,
} from "../src/modules/pdfPageCount";

describe("PDF page count helpers", function () {
  beforeEach(function () {
    clearPDFPageCounts();
  });

  it("should default missing and uncached items to zero", function () {
    assert.equal(getItemPDFPageCount(null), 0);
    assert.equal(getItemPDFPageCount({ id: 123 }), 0);
  });

  it("should pad sortable values for numeric sorting", function () {
    assert.equal(getSortablePDFPageCount({ id: 123 }), "0000000000");
  });

  it("should load page counts from Zotero DB array-like rows", async function () {
    const originalQueryAsync = Zotero.DB.queryAsync;
    let queriedSQL = "";
    const rows = {
      0: { itemID: 123, pages: 42 },
      1: { itemID: "456", pages: "7" },
      length: 2,
    } as ArrayLike<{ itemID: number | string; pages: number | string }>;

    Zotero.DB.queryAsync = (async (sql) => {
      queriedSQL = sql;
      return rows as unknown as Awaited<
        ReturnType<typeof Zotero.DB.queryAsync>
      >;
    }) as typeof Zotero.DB.queryAsync;

    try {
      await refreshPDFPageCounts();
    } finally {
      Zotero.DB.queryAsync = originalQueryAsync;
    }

    assert.match(queriedSQL, /^SELECT\b/);
    assert.equal(getItemPDFPageCount({ id: 123 }), 42);
    assert.equal(getItemPDFPageCount({ id: 456 }), 7);
  });
});
