// A SQLiteDBConnection-shaped test double backed by Node's built-in sqlite module, so unit
// tests can run the app's *real* sqlite repos + createSchemaAndSeed() against a real SQLite
// engine — no Capacitor plugin, no device — instead of re-implementing their SQL by hand.
//
// Only implements the three methods the repo layer actually calls (execute/query/run — see
// `grep -rhoE "\bdb\.[a-zA-Z]+\(" src/lib/data | sort -u`). Node's sqlite module is stable
// as of Node 22.5+ but still emits an ExperimentalWarning; tests don't need to silence it.
import { DatabaseSync } from "node:sqlite";
import type { SQLiteDBConnection } from "@capacitor-community/sqlite";

export function createNodeSqliteDb(): SQLiteDBConnection {
  const raw = new DatabaseSync(":memory:");

  return {
    async execute(statements: string) {
      raw.exec(statements);
      return { changes: { changes: 0 } };
    },

    async query(statement: string, values: unknown[] = []) {
      const rows = raw.prepare(statement).all(...(values as never[]));
      return { values: rows };
    },

    async run(statement: string, values: unknown[] = []) {
      const info = raw.prepare(statement).run(...(values as never[]));
      return { changes: { changes: info.changes, lastId: Number(info.lastInsertRowid) } };
    },

    async open() {},
    async close() {},
  } as unknown as SQLiteDBConnection;
}
