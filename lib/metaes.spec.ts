import { assert, expect } from "chai";
import { beforeEach, describe, it } from "mocha";
import { Context, evalFunctionBodyAsPromise, MetaesContext } from "./metaes";

describe("Evaluation", () => {
  let context: Context;
  beforeEach(() => {
    context = new MetaesContext();
  });
  it("success continuation should be called", () => new Promise(resolve => context.evaluate("2", resolve)));

  it("error continuation should be called", () => new Promise(resolve => context.evaluate("throw 1;", null, resolve)));

  it("should not throw in current callstack", () => {
    expect(() => context.evaluate("throw 1;")).to.not.throw();
  });

  it("should correctly execute scripting context", async () => {
    assert.equal(await evalFunctionBodyAsPromise({ context, source: a => a * 2 }, { values: { a: 1 } }), 2);
  });

  it("should correctly execute cooperatively", async () => {
    [1, 2, 3, 4, 5, 6].forEach(async i =>
      assert.equal(await evalFunctionBodyAsPromise({ context, source: a => a * 2 }, { values: { a: i } }), i * 2)
    );
  });
});
