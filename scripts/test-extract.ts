import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type Env = Record<string, string>;

const defaultInvoiceDirs = [
  "C:\\Users\\DK\\Desktop\\Projects\\Codex BOQ\\Sample Invoices",
  "C:\\Users\\DK\\Desktop\\Projects\\Dheera Construction\\Demo\\Sample Invoices",
  "C:\\Users\\DK\\Desktop\\Projects\\Dheera Construction\\BOQ Management\\Individual Invoices",
];

function readEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
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
    if (!env[key]) {
      throw new Error(`Missing ${key} in .env.local`);
    }
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

function findSampleInvoice() {
  for (const dir of defaultInvoiceDirs) {
    if (!existsSync(dir)) {
      continue;
    }

    const invoice = readdirSync(dir)
      .filter((fileName) => /\.(pdf|png|jpe?g|webp)$/i.test(fileName))
      .sort()[0];

    if (invoice) {
      return path.join(dir, invoice);
    }
  }

  throw new Error("No sample invoice found. Pass a file path as arg 1.");
}

async function main() {
  const env = loadEnv();
  const invoicePath = process.argv[2] || findSampleInvoice();
  const baseUrl = process.argv[3] || "http://localhost:3000";
  const mime = detectMime(invoicePath);
  const fileName = path.basename(invoicePath).replace(/[^\w.-]/g, "_");
  const storagePath = `test-invoices/${Date.now()}-${fileName}`;
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  const upload = await supabase.storage
    .from("boqai-docs")
    .upload(storagePath, readFileSync(invoicePath), {
      contentType: mime,
      upsert: true,
    });

  if (upload.error) {
    throw new Error(`Upload failed: ${upload.error.message}`);
  }

  try {
    const response = await fetch(`${baseUrl}/api/ai/extract-invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_path: storagePath,
        mime,
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(JSON.stringify(payload, null, 2));
    }

    console.log(JSON.stringify(payload.parsed, null, 2));
  } finally {
    await supabase.storage.from("boqai-docs").remove([storagePath]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
