import { evaluate, evaluateArray, visitArray } from "../applyEval";
import { GetValue } from "../environment";
import { LocatedError, NotImplementedException } from "../exceptions";
import { createMetaFunction } from "../metafunction";
import * as NodeTypes from "../nodeTypes";
import { EvaluationConfig, MetaesException } from "../types";

function hoistDeclarations(e: NodeTypes.Statement[], c, cerr, env, config) {
  visitArray(
    e.filter(e => e.type === "FunctionDeclaration") as NodeTypes.FunctionDeclaration[],
    (e, c, cerr) =>
      evaluate(
        e,
        value => evaluate({ type: "SetValue", name: e.id.name, value, isDeclaration: true }, c, cerr, env, config),
        cerr,
        env,
        config
      ),
    c,
    cerr
  );
}

export function BlockStatement(e: NodeTypes.BlockStatement | NodeTypes.Program, c, cerr, env, config) {
  hoistDeclarations(
    e.body,
    () => evaluateArray(e.body, blockValues => c(blockValues[blockValues.length - 1]), cerr, env, config),
    cerr,
    env,
    config
  );
}

export function Program(e: NodeTypes.Program, c, cerr, env, config) {
  BlockStatement(e, c, cerr, env, config);
}

export function VariableDeclaration(e: NodeTypes.VariableDeclaration, c, cerr, env, config) {
  visitArray(
    e.declarations,
    (declarator: NodeTypes.VariableDeclarator, c, cerr) => evaluate(declarator, c, cerr, env, config),
    c,
    cerr
  );
}

export function VariableDeclarator(e: NodeTypes.VariableDeclarator, c, cerr, env, config) {
  function id(initValue) {
    switch (e.id.type) {
      case "Identifier":
        evaluate({ type: "SetValue", name: e.id.name, value: initValue, isDeclaration: true }, c, cerr, env, config);
        break;
      case "ObjectPattern":
        visitArray(
          e.id.properties,
          (property, c, cerr) => {
            if (property.key.type === "Identifier") {
              if (property.value) {
                // For example: let {x} = obj;
                // Don't want to try evaluate {x:x} as expanded property, so skip property evaluation.
                if (property.shorthand && property.value.type === "Identifier") {
                  const name = property.key.name;
                  evaluate(
                    { type: "SetValue", name, value: initValue[name], isDeclaration: true },
                    c,
                    cerr,
                    env,
                    config
                  );
                } else {
                  const name = property.key.name;
                  const setValue = value =>
                    evaluate({ type: "SetValue", name, value, isDeclaration: true }, c, cerr, env, config);
                  initValue[name] ? setValue(initValue[name]) : evaluate(property.value, setValue, cerr, env, config);
                }
              } else {
                evaluate(property, c, cerr, env, config);
              }
            } else {
              cerr(
                NotImplementedException(
                  `Property key of '${property.key.type}' type is not supported yet.`,
                  property.key
                )
              );
            }
          },
          c,
          cerr
        );
        break;
      default:
        cerr(NotImplementedException(`Init '${(<any>e.id).type}' is not supported yet.`, e));
    }
  }
  e.init ? evaluate(e.init, id, cerr, env, config) : id(undefined);
}

export function AssignmentPattern(e: NodeTypes.AssignmentPattern, c, cerr, env, config) {
  evaluate(
    e.right,
    right => {
      switch (e.left.type) {
        case "Identifier":
          evaluate({ type: "SetValue", name: e.left.name, value: right, isDeclaration: true }, c, cerr, env, config);
          break;
        default:
          cerr(
            NotImplementedException(
              `${e.left.type} is not supported as AssignmentPattern left-hand side value.`,
              e.left
            )
          );
      }
    },
    cerr,
    env,
    config
  );
}

export function IfStatement(e: NodeTypes.IfStatement | NodeTypes.ConditionalExpression, c, cerr, env, config) {
  evaluate(
    e.test,
    test => {
      if (test) {
        evaluate(e.consequent, c, cerr, env, config);
      } else if (e.alternate) {
        evaluate(e.alternate, c, cerr, env, config);
      } else {
        c();
      }
    },
    cerr,
    env,
    config
  );
}

export function ExpressionStatement(e: NodeTypes.ExpressionStatement, c, cerr, env, config) {
  evaluate(e.expression, c, cerr, env, config);
}

// Use name which is illegal JavaScript identifier.
// It will disallow collision with user names.
const EXCEPTION_NAME = "/exception";

export function TryStatement(e: NodeTypes.TryStatement, c, cerr, env, config: EvaluationConfig) {
  evaluate(
    e.block,
    c,
    exception =>
      evaluate(
        e.handler,
        () => (e.finalizer ? evaluate(e.finalizer, c, cerr, env, config) : c()),
        cerr,
        {
          values: {
            [EXCEPTION_NAME]: exception.value
          },
          prev: env
        },
        config
      ),
    env,
    config
  );
}

export function ThrowStatement(e: NodeTypes.ThrowStatement, _c, cerr, env, config) {
  evaluate(e.argument, value => cerr({ type: "ThrowStatement", value, location: e }), cerr, env, config);
}

export function CatchClause(e: NodeTypes.CatchClause, c, cerr, env, config) {
  GetValue(
    { name: EXCEPTION_NAME },
    (error: MetaesException | Error) =>
      evaluate(
        e.body,
        c,
        cerr,
        {
          values: {
            // TODO: add more tests
            // In case error is an exception, just use its value
            [e.param.name]: error ? Object.hasOwnProperty.call(error, "value") || error : error
          },
          prev: env
        },
        config
      ),
    cerr,
    env
  );
}

export function ReturnStatement(e: NodeTypes.ReturnStatement, _c, cerr, env, config) {
  e.argument
    ? evaluate(e.argument, value => cerr({ type: "ReturnStatement", value }), cerr, env, config)
    : cerr({ type: "ReturnStatement" });
}

export function FunctionDeclaration(e: NodeTypes.FunctionDeclaration, c, cerr, env, config) {
  try {
    c(createMetaFunction(e, env, config));
  } catch (error) {
    cerr(LocatedError(error, e));
  }
}

export function ForInStatement(e: NodeTypes.ForInStatement, c, cerr, env, config) {
  evaluate(
    e.right,
    right => {
      const leftNode = e.left;
      if (leftNode.type === "Identifier") {
        visitArray(
          Object.keys(right),
          (name, c, cerr) =>
            evaluate(
              { type: "SetValue", name: leftNode.name, value: name, isDeclaration: false },
              () => evaluate(e.body, c, cerr, env, config),
              cerr,
              env,
              config
            ),
          c,
          cerr
        );
      } else {
        cerr(NotImplementedException("Only identifier in left-hand side is supported now."));
      }
    },
    cerr,
    env,
    config
  );
}

export function ForStatement(e: NodeTypes.ForStatement, _c, cerr, env, config) {
  evaluate(e.init, _init => cerr(NotImplementedException(`${e.type} is not implemented yet`)), cerr, env, config);
}

export function ForOfStatement(e: NodeTypes.ForOfStatement, c, cerr, env, config) {
  evaluate(
    e.right,
    right => {
      if (!Array.isArray(right)) {
        cerr(NotImplementedException("Only arrays as right-hand side of for-of loop are supported for now.", e.right));
      } else {
        if (e.left.type === "VariableDeclaration" && e.left.declarations[0].id.type === "Identifier") {
          // create iterator in new env
          evaluate(
            e.left,
            _ =>
              // TODO: iterate over declarations in e.left
              visitArray(
                right,
                (rightItem, c, cerr) => {
                  const bodyEnv = { prev: env, values: {} };

                  /**
                   * TODO: currently left-hand side of loop definition is bound to new environment
                   * for each iteration. It means it supports `let`/`const` style (creates new scope),
                   * but not `var` (where shouldn't be created).
                   *
                   * Should support both semantics.
                   */
                  evaluate(
                    {
                      type: "SetValue",
                      name: (<NodeTypes.Identifier>e.left.declarations[0].id).name,
                      value: rightItem,
                      isDeclaration: true
                    },
                    () => evaluate(e.body, c, cerr, bodyEnv, config),
                    cerr,
                    bodyEnv,
                    config
                  );
                },
                c,
                cerr
              ),
            cerr,
            env,
            config
          );
        } else {
          cerr(
            NotImplementedException(
              `Left-hand side of type ${e.left.declarations[0].id.type} in ${e.type} not implemented yet.`
            )
          );
        }
      }
    },
    cerr,
    env,
    config
  );
}

export function WhileStatement(e: NodeTypes.WhileStatement, c, cerr, env, config) {
  (function loop() {
    evaluate(e.test, test => (test ? evaluate(e.body, loop, cerr, env, config) : c()), cerr, env, config);
  })();
}

export function EmptyStatement(_e: NodeTypes.EmptyStatement, c) {
  c();
}

// TODO: clean up, fix error
export function ClassDeclaration(e: NodeTypes.ClassDeclaration, c, cerr, env, config) {
  evaluate(
    e.superClass,
    superClass =>
      evaluate(
        e.body,
        body =>
          visitArray(
            body,
            ({ key, value }, c, cerr) => {
              if (key === "constructor") {
                value.prototype = Object.create(superClass.prototype);
                if (e.id) {
                  evaluate({ type: "SetValue", name: e.id.name, value, isDeclaration: true }, c, cerr, env, config);
                } else {
                  cerr(NotImplementedException("Not implemented case"));
                }
              } else {
                cerr(NotImplementedException("Methods handling not implemented yet."));
              }
            },
            c,
            cerr
          ),
        cerr,
        env,
        config
      ),
    cerr,
    env,
    config
  );
}

export function ClassBody(e: NodeTypes.ClassBody, c, cerr, env, config) {
  evaluateArray(e.body, c, cerr, env, config);
}

export function MethodDefinition(e: NodeTypes.MethodDefinition, c, cerr, env, config) {
  evaluate(
    e.value,
    value =>
      e.kind === "constructor"
        ? c({ key: e.key.name, value })
        : cerr(NotImplementedException("Object methods not implemented yet.")),
    cerr,
    env,
    config
  );
}

export function DebuggerStatement(_e: NodeTypes.DebuggerStatement, c) {
  debugger;
  c();
}

export default {
  BlockStatement,
  Program,
  VariableDeclarator,
  VariableDeclaration,
  AssignmentPattern,
  IfStatement,
  ExpressionStatement,
  TryStatement,
  ThrowStatement,
  CatchClause,
  ReturnStatement,
  FunctionDeclaration,
  ForInStatement,
  ForStatement,
  ForOfStatement,
  WhileStatement,
  EmptyStatement,
  ClassDeclaration,
  ClassBody,
  MethodDefinition,
  DebuggerStatement
};
