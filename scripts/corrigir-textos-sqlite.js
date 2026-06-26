require("dotenv").config();

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const caminhoInformado = args.find((arg) => !arg.startsWith("--"));

const correcoes = [
  ["FLYING D?TCHMAN", "FLYING DUTCHMAN"],
  ["POUSSE CAF?", "POUSSE CAFÉ"],
  ["CAF?", "CAFÉ"],
  ["PIÐA", "PIÑA"],
  ["aþ·car", "açúcar"],
  ["Umedeþa", "Umedeça"],
  ["pedaþos", "pedaços"],
  ["pedaþo", "pedaço"],
  ["curaþau", "curaçau"],
  ["cßlice", "cálice"],
  ["refratßria", "refratária"],
  ["ßgua", "água"],
  ["taþa", "taça"],
  ["limÒo", "limão"],
  ["balÒo", "balão"],
  ["hortelÒ", "hortelã"],
  ["cafÚ", "café"],
  ["superfÝcie", "superfície"],
  ["·ltimo", "último"]
];

function resolverBanco() {
  const candidatos = [
    caminhoInformado,
    process.env.SQLITE_FILE,
    path.join(__dirname, "..", "data", "app.db"),
    path.join(__dirname, "..", "migracao-sqlite", "app.db")
  ].filter(Boolean);

  for (const candidato of candidatos) {
    const absoluto = path.resolve(candidato);
    if (fs.existsSync(absoluto)) return absoluto;
  }

  throw new Error(`Banco SQLite nao encontrado. Informe o caminho: npm run textos:corrigir -- /caminho/app.db`);
}

function quoteId(nome) {
  return `"${String(nome).replace(/"/g, '""')}"`;
}

function colunasTexto(db) {
  const tabelas = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => row.name);
  const colunas = [];

  for (const tabela of tabelas) {
    const info = db.prepare(`PRAGMA table_info(${quoteId(tabela)})`).all();
    for (const coluna of info) {
      if (/TEXT|CHAR|CLOB|VARCHAR|NVARCHAR|NCHAR/i.test(coluna.type || "")) {
        colunas.push({ tabela, coluna: coluna.name });
      }
    }
  }

  return colunas;
}

function corrigirTexto(valor) {
  let corrigido = valor;
  for (const [antes, depois] of correcoes) {
    corrigido = corrigido.split(antes).join(depois);
  }
  return corrigido;
}

function nomeBackup(arquivo) {
  const agora = new Date();
  const stamp = [
    agora.getFullYear(),
    String(agora.getMonth() + 1).padStart(2, "0"),
    String(agora.getDate()).padStart(2, "0"),
    "-",
    String(agora.getHours()).padStart(2, "0"),
    String(agora.getMinutes()).padStart(2, "0"),
    String(agora.getSeconds()).padStart(2, "0")
  ].join("");
  return path.join(path.dirname(arquivo), `app.pre-correcao-textos-${stamp}.db`);
}

const arquivo = resolverBanco();
console.log(`Banco: ${arquivo}`);
console.log(`Modo: ${dryRun ? "simulacao (--dry-run)" : "corrigir de verdade"}`);

if (!dryRun) {
  const backup = nomeBackup(arquivo);
  fs.copyFileSync(arquivo, backup);
  console.log(`Backup criado: ${backup}`);
}

const db = new Database(arquivo, { readonly: dryRun });
if (!dryRun) db.pragma("foreign_keys = OFF");

const resumo = new Map();
const exemplos = [];
let celulas = 0;

const executar = db.transaction(() => {
  for (const { tabela, coluna } of colunasTexto(db)) {
    const rows = db
      .prepare(`SELECT rowid, ${quoteId(coluna)} AS valor FROM ${quoteId(tabela)} WHERE ${quoteId(coluna)} IS NOT NULL`)
      .all();
    const update = dryRun ? null : db.prepare(`UPDATE ${quoteId(tabela)} SET ${quoteId(coluna)} = ? WHERE rowid = ?`);

    for (const row of rows) {
      const original = String(row.valor);
      const corrigido = corrigirTexto(original);
      if (corrigido === original) continue;

      celulas += 1;
      const chave = `${tabela}.${coluna}`;
      resumo.set(chave, (resumo.get(chave) || 0) + 1);
      if (exemplos.length < 12) {
        exemplos.push({ tabela, coluna, rowid: row.rowid, antes: original, depois: corrigido });
      }
      if (!dryRun) update.run(corrigido, row.rowid);
    }
  }
});

executar();
if (!dryRun) db.pragma("foreign_keys = ON");
db.close();

console.log(`Celulas ${dryRun ? "que seriam corrigidas" : "corrigidas"}: ${celulas}`);
for (const [chave, total] of [...resumo.entries()].sort()) {
  console.log(`- ${chave}: ${total}`);
}

if (exemplos.length) {
  console.log("\nExemplos:");
  for (const exemplo of exemplos) {
    console.log(`- ${exemplo.tabela}.${exemplo.coluna}#${exemplo.rowid}`);
    console.log(`  antes: ${exemplo.antes.replace(/\s+/g, " ").trim().slice(0, 180)}`);
    console.log(`  depois: ${exemplo.depois.replace(/\s+/g, " ").trim().slice(0, 180)}`);
  }
}
