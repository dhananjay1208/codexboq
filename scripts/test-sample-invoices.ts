import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type Env = Record<string, string>;

const sampleInvoiceDir =
  "C:\\Users\\DK\\Desktop\\Projects\\Codex BOQ\\Sample Invoices";
const outputDir =
  "C:\\Users\\DK\\Desktop\\Projects\\Codex BOQ\\Demo Documents\\extraction-results";

function readEnvFile(filePath: string) {
  if (!existsSync(filePath)) return {};

  return Object.fromEntries(
    readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      })
  );
}

function loadEnv() {
  const processEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
  const env: Env = {
    ...readEnvFile(path.join(process.cwd(), ".env")),
    ...readEnvFile(path.join(process.cwd(), ".env.local")),
    ...processEnv,
  };

  for (const key of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    if (!env[key]) throw new Error(`Missing ${key} in .env.local`);
  }

  return env;
}

function detectMime(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  throw new Error(`Unsupported invoice extension: ${ext}`);
}

async function main() {
  if (!existsSync(sampleInvoiceDir)) {
    throw new Error(`Sample invoice folder not found: ${sampleInvoiceDir}`);
  }

  mkdirSync(outputDir, { recursive: true });

  const env = loadEnv();
  const baseUrl = process.argv[2] || "http://localhost:3000";
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const files = readdirSync(sampleInvoiceDir)
    .filter((fileName) => /\.(pdf|png|jpe?g|webp)$/i.test(fileName))
    .sort();

  const results = [];
  for (const fileName of files) {
    const invoicePath = path.join(sampleInvoiceDir, fileName);
    const mime = detectMime(invoicePath);
    const storagePath = `test-invoices/${Date.now()}-${fileName.replace(/[^\w.-]/g, "_")}`;

    console.log(`Testing ${fileName}...`);
    const upload = await supabase.storage
      .from("boqai-docs")
      .upload(storagePath, readFileSync(invoicePath), {
        contentType: mime,
        upsert: true,
      });

    if (upload.error) throw new Error(`Upload failed for ${fileName}: ${upload.error.message}`);

    try {
      const response = await fetch(`${baseUrl}/api/ai/extract-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: storagePath, mime }),
      });
      const payload = await response.json();

      if (!response.ok) {
        results.push({ fileName, ok: false, error: payload.error ?? `HTTP ${response.status}` });
        continue;
      }

      const parsed = payload.parsed;
      results.push({
        fileName,
        ok: true,
        invoice_number: parsed.invoice_number,
        invoice_date: parsed.invoice_date,
        vendor_name: parsed.vendor_name,
        line_count: parsed.line_items?.length ?? 0,
        line_items: parsed.line_items,
      });
    } finally {
      await supabase.storage.from("boqai-docs").remove([storagePath]);
    }
  }

  const outputPath = path.join(outputDir, `sample-invoice-extraction-${Date.now()}.json`);
  const latestPath = path.join(outputDir, "latest-sample-invoice-extraction.json");
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  writeFileSync(latestPath, JSON.stringify(results, null, 2));

  console.table(
    results.map((result) =>
      result.ok
        ? {
            file: result.fileName,
            ok: "yes",
            invoice: result.invoice_number,
            supplier: result.vendor_name,
            lines: result.line_count,
          }
        : {
            file: result.fileName,
            ok: "no",
            invoice: "-",
            supplier: result.error,
            lines: 0,
          }
    )
  );
  console.log(`Saved detailed extraction results to ${outputPath}`);
  console.log(`Updated latest extraction results at ${latestPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
