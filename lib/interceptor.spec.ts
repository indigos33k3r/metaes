import { describe, it } from "mocha";
import { assert, expect } from "chai";
import { metaesEval } from "./metaes";
import { Evaluation } from "./types";

describe("Interceptor", () => {
  function getEvaluationsOf(script: string, env) {
    let evaluations: Evaluation[] = [];

    function interceptor(evaluation) {
      evaluations.push(evaluation);
    }

    function noop() {}

    metaesEval(script, noop, console.log, env, { interceptor });
    return evaluations;
  }

  it("should be called specific amount of times", () => {
    assert.equal(getEvaluationsOf("2", {}).length, 10);
  });

  it("should be called specific amount of times", () => {
    const evaluations = getEvaluationsOf(`container["b"]=2`, { container: {} });

    assert.equal(evaluations.length, 24);
    const values = evaluations.map(({ tag, e }) => tag.propertyKey || e.type).filter(Boolean);

    expect(values).to.eql([
      "Program",
      "body",
      "ExpressionStatement",
      "expression",
      "AssignmentExpression",
      "right",
      "Literal",
      "Literal",
      "right",
      "left",
      "object",
      "Identifier",
      "Identifier",
      "object",
      "property",
      "Literal",
      "Literal",
      "property",
      "left",
      "AssignmentExpression",
      "expression",
      "ExpressionStatement",
      "body",
      "Program"
    ]);
  });

  it("should pass values of MemberExpression", () => {
    expect(
      getEvaluationsOf("a.b", { a: { b: 2 } })
        .map(({ tag }) => tag.propertyKey)
        .filter(Boolean)
    ).to.eql(["body", "expression", "object", "object", "property", "property", "expression", "body"]);

    expect(
      getEvaluationsOf("a.b", { a: { b: 2 } })
        .map(({ e, tag }) => tag.propertyKey || e.type)
        .filter(Boolean)
    ).to.eql([
      "Program",
      "body",
      "ExpressionStatement",
      "expression",
      "MemberExpression",
      "object",
      "Identifier",
      "Identifier",
      "object",
      "property",
      "Identifier",
      "Identifier",
      "property",
      "MemberExpression",
      "expression",
      "ExpressionStatement",
      "body",
      "Program"
    ]);
    expect(
      getEvaluationsOf("a.b", { a: { b: 2 } })
        .map(({ e, value, tag }) => (value ? [tag.propertyKey || e.type, value] : null))
        .filter(Boolean)
    ).to.eql([
      [
        "Identifier",
        {
          b: 2
        }
      ],
      ["Identifier", 2],
      ["MemberExpression", 2],
      ["ExpressionStatement", 2],
      ["Program", 2]
    ]);
  });
});