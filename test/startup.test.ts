import { assert } from "chai";
import { config } from "../package.json";

describe("startup", function () {
  it("should have plugin instance defined", function () {
    assert.isNotEmpty(
      (Zotero as unknown as Record<string, unknown>)[config.addonInstance],
    );
  });

  it("should initialize without startup errors", function () {
    const plugin = (Zotero as unknown as Record<string, { data?: unknown }>)[
      config.addonInstance
    ];
    const data = plugin.data as {
      initialized?: boolean;
      startupError?: unknown;
    };

    assert.isTrue(data.initialized);
    assert.isUndefined(data.startupError);
  });
});
