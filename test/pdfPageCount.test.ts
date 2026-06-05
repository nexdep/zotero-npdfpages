import { assert } from "chai";
import { beforeEach, describe, it } from "mocha";
import {
  clearPDFPageCounts,
  getItemPDFPageCount,
  getSortablePDFPageCount,
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
});
