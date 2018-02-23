import { parse } from "./parse";
import { EvaluationError, EvaluationConfig, LocatedError, EvaluationSuccess, Evaluate, Source } from "./types";
import { evaluate } from "./applyEval";
import { ASTNode } from "./nodes/nodes";
import { FunctionNode, ExpressionStatement } from "./nodeTypes";
import { Environment, EnvironmentBase } from "./environment";

const log = e => console.log(e);

export interface ScriptingContext {
  evaluate: Evaluate;
}

export const metaesEval: Evaluate = (source, c?, cerr?, environment = {}, config = {}) => {
  try {
    const node: ASTNode =
      typeof source === "object" ? source : typeof source === "function" ? parseFunction(source) : parse(source);
    let env: Environment;

    if ("values" in environment) {
      env = environment as Environment;
    } else {
      env = {
        values: environment
      };
    }

    evaluate(
      node,
      env,
      config,
      val => c && c(val, node),
      error => cerr && cerr(error instanceof LocatedError ? error : new LocatedError(error, node))
    );
  } catch (e) {
    if (cerr) {
      cerr(e);
    } else {
      throw e;
    }
  }
};

export class MetaESContext implements ScriptingContext {
  constructor(
    public c?: EvaluationSuccess,
    public cerr?: EvaluationError,
    public environment: Environment = { values: {} },
    public config: EvaluationConfig = { onError: log }
  ) {}

  evaluate(
    source: Source | Function,
    c?: EvaluationSuccess,
    cerr?: EvaluationError,
    environment?: EnvironmentBase,
    config?: EvaluationConfig
  ) {
    let env = this.environment;
    if (environment) {
      env = Object.assign({ prev: this.environment }, environment);
    }
    return metaesEval(source, c || this.c, cerr || this.cerr, env, config || this.config);
  }
}

export const evaluatePromisified = (
  context: ScriptingContext,
  source: Source | Function,
  environment?: EnvironmentBase
) => new Promise<any>((resolve, reject) => context.evaluate(source, resolve, reject, environment));

const parseFunction = (fn: Function) => parse("(" + fn.toString() + ")");

/**
 * Function params are igonred, they are used only to satisfy linters/compilers on client code.
 * @param context
 * @param source
 * @param environment
 */
export const evaluateFunctionBodyPromisified = (
  context: ScriptingContext,
  source: Function,
  environment?: EnvironmentBase
) =>
  new Promise<any>((resolve, reject) =>
    context.evaluate(
      ((parseFunction(source).body[0] as ExpressionStatement).expression as FunctionNode).body,
      resolve,
      reject,
      environment
    )
  );

export const consoleLoggingMetaESContext = (environment: Environment = { values: {} }) =>
  new MetaESContext(
    value => {
      console.log(value);
    },
    e => console.log(e),
    environment,
    {
      interceptor: evaluation => {
        console.log(evaluation);
      },
      onError: (e: LocatedError) => {
        console.log(e);
      }
    }
  );
