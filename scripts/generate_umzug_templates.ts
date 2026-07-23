import fs from "node:fs";
import path from "node:path";

const dir = "./src/migrations";

if (!fs.existsSync(dir)) {
    console.error(`❌ Ordner ${dir} existiert nicht.`);
    process.exit(1);
}

// Finde alle SQL-Dateien und sortiere sie alphanumerisch
const sqlFiles = fs.readdirSync(dir)
    .filter(f => f.endsWith(".sql"))
    .sort();

if (sqlFiles.length === 0) {
    console.log("ℹ️ Keine SQL-Migrationsdateien gefunden.");
    process.exit(0);
}

// Nimm die neueste Datei und extrahiere den Zeitstempel
const timestamp = sqlFiles[sqlFiles.length - 1]!.split("_")[0];

const template = `import { sql } from "drizzle-orm";

export const up = async ({ context }: { context: { db: any } }) => {
  // Your custom migration code (runs with Umzug)
};

export const down = async ({ context }: { context: { db: any } }) => {
  // Optional rollback
};
`;

const prePath = path.join(dir, `${timestamp}_0_pre.ts`);
const postPath = path.join(dir, `${timestamp}_z_post.ts`);

// Dateien nur schreiben, wenn sie nicht schon existieren
if (!fs.existsSync(prePath)) fs.writeFileSync(prePath, template);
if (!fs.existsSync(postPath)) fs.writeFileSync(postPath, template);

console.log(`✨ Created pre and post TS templates for timestamp: ${timestamp}`);