import Database from "better-sqlite3";
const db = new Database("data.db");
console.log(db.prepare("SELECT code, name, subtype FROM ledger_accounts WHERE subtype = 'bank' OR subtype = 'cash'").all());
