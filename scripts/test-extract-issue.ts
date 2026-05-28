import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { createClient } from "@supabase/supabase-js";

type Env = Record<string, string>;

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

function sampleIssueVoucherImage() {
  const canvas = createCanvas(1200, 1600);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "black";
  ctx.font = "bold 56px Arial";
  ctx.fillText("MATERIAL ISSUE VOUCHER", 90, 120);
  ctx.font = "36px Arial";
  ctx.fillText("Voucher No: MIV-TEST-001", 90, 220);
  ctx.fillText("Issue Date: 2026-05-27", 90, 290);
  ctx.fillText("Issued To: Tower A - Masonry Workstation", 90, 360);
  ctx.fillText("Site: Hackathon Demo Tower", 90, 430);
  ctx.font = "bold 38px Arial";
  ctx.fillText("Items", 90, 560);
  ctx.font = "34px Arial";
  ctx.fillText("1. PPC Cement        Qty: 12     Unit: bag", 90, 650);
  ctx.fillText("   Notes: Blockwork mortar", 90, 705);
  ctx.fillText("2. River Sand        Qty: 2.5    Unit: cum", 90, 805);
  ctx.fillText("   Notes: Masonry", 90, 860);
  ctx.fillText("3. TMT Bar Fe500D 8 mm Qty: 150  Unit: kg", 90, 960);
  ctx.fillText("   Notes: Lintel cages", 90, 1015);

  return canvas.toBuffer("image/png");
}

async function main() {
  const env = loadEnv();
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const filePath = `test/issue-vouchers/sample_${Date.now()}.png`;
  const upload = await supabase.storage
    .from("boqai-docs")
    .upload(filePath, sampleIssueVoucherImage(), {
      contentType: "image/png",
      upsert: false,
    });

  if (upload.error) throw new Error(upload.error.message);

  const endpoint = env.ISSUE_EXTRACT_URL || "http://localhost:3000/api/ai/extract-issue";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file_path: filePath,
      mime: "image/png",
    }),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? `HTTP ${response.status}`);
  }

  console.log(JSON.stringify(payload.parsed, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
