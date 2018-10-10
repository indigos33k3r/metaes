import * as bodyParser from "body-parser";
import * as express from "express";
import * as helmet from "helmet";
import * as http from "http";
import * as WebSocket from "ws";
import { Environment } from "./environment";
import { log } from "./logging";
import { Context, evalToPromise, MetaesContext } from "./metaes";
import { assertMessage, environmentFromMessage, environmentToMessage, mergeValues, MetaesMessage } from "./remote";
import { Continuation, ErrorContinuation, Source } from "./types";

const config = {
  port: 8082
};

const localContext = new MetaesContext(
  value => {
    console.log("[value]");
    console.log(value);
  },
  e => console.log(e),
  {
    values: {
      fs: require("fs"),
      child_process: require("child_process"),
      console
    }
  }
);

export const runWSServer = (port: number = config.port) =>
  new Promise((resolve, _reject) => {
    const server = http.createServer();
    const app = express();
    app.use(bodyParser.json());
    app.use(helmet());

    const webSocketServer = new WebSocket.Server({ server });

    webSocketServer.on("connection", connection => {
      const clientContext: Context = {
        evaluate: (input: Source, _c?: Continuation, _cerr?: ErrorContinuation, environment?: Environment) => {
          log("[Server: in evaluate/environment", environment);
          const message = {
            source: input,
            env: environmentToMessage(clientContext, mergeValues({}, environment))
          };
          log("[Server sending message]", JSON.stringify(message));
          connection.send(JSON.stringify(assertMessage(message)));
        }
      };

      connection.on("message", async message => {
        let environment;
        try {
          const { source, env } = assertMessage(JSON.parse(message)) as MetaesMessage;
          environment = env ? environmentFromMessage(clientContext, env) : { values: {} };
          log("[Server: got raw message]:", message);

          log("[Server: client environmentFromJSON]", environment);

          const result = await evalToPromise(localContext, source, environment);
          log("[Server: result]", result);

          clientContext.evaluate(
            `c(result)`,
            environment.values.c,
            environment.values.cerr,
            mergeValues({ result }, environment)
          );
        } catch (e) {
          log("[Server: caught error]", e.message);
          log("[Server: client environment]", environment);
          log("[Server: client environmentToJSON]", environmentToMessage(clientContext, environment));
          clientContext.evaluate(
            `cerr(error)`,
            null,
            null,
            mergeValues({ error: { message: (e.originalError || e).message } }, environment)
          );
        }
      });

      connection.on("error", e => console.log(e));
      connection.on("close", () => log("[Server: closed ws connection with browser.]"));
    });

    server.on("request", app);
    server.listen(port, () => {
      log("[Server: Listening on " + server.address().port + "]");
      resolve(server);
    });
  });
