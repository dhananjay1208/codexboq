import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { openai } from "@/lib/openai";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

const auditComplianceRequest = z.object({
  file_path: z.string().min(1),
  mime: z.string().min(1),
  expected_doc_type: z.enum(["test_certificate", "tds"]),
  expected_material_name: z.string().min(1),
});

const auditSchema = {
  type: "object",
  properties: {
    doc_type_detected: {
      type: "string",
      enum: ["test_certificate", "tds", "other"],
    },
    doc_type_matches_expected: { type: "boolean" },
    material_mentioned: { type: ["string", "null"] },
    material_matches_expected: { type: "boolean" },
    validity_date: { type: ["string", "null"] },
    issue_date: { type: ["string", "null"] },
    issuing_authority: { type: ["string", "null"] },
    is_valid_today: { type: "boolean" },
    flags: {
      type: "array",
      items: { type: "string" },
    },
    confidence: { type: "number" },
  },
  required: [
    "doc_type_detected",
    "doc_type_matches_expected",
    "material_mentioned",
    "material_matches_expected",
    "validity_date",
    "issue_date",
    "issuing_authority",
    "is_valid_today",
    "flags",
    "confidence",
  ],
  additionalProperties: false,
} as const;

function bufferToDataUrl(buffer: Buffer, mime: string) {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function documentPart(buffer: Buffer, mime: string, filePath: string) {
  if (mime === "application/pdf" || mime.includes("pdf")) {
    return {
      type: "file" as const,
      file: {
        filename: filePath.split("/").pop() ?? "compliance-document.pdf",
        file_data: bufferToDataUrl(buffer, "application/pdf"),
      },
    };
  }

  if (mime.startsWith("image/")) {
    return {
      type: "image_url" as const,
      image_url: { url: bufferToDataUrl(buffer, mime), detail: "high" as const },
    };
  }

  throw new Error(`Unsupported compliance document mime type: ${mime}`);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = auditComplianceRequest.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid compliance audit payload." },
      { status: 400 }
    );
  }

  const {
    file_path: filePath,
    mime,
    expected_doc_type: expectedDocType,
    expected_material_name: expectedMaterialName,
  } = parsed.data;
  const { data: file, error } = await supabaseAdmin()
    .storage
    .from("boqai-docs")
    .download(filePath);

  if (error || !file) {
    return NextResponse.json(
      { error: error?.message ?? "Could not download compliance file." },
      { status: 404 }
    );
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const buffer = Buffer.from(await file.arrayBuffer());
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You audit construction material compliance documents. The expected document type is ${expectedDocType} for material '${expectedMaterialName}'. Verify the document type, that the material matches, extract issue and validity dates, determine if valid today (${today}), and list any problems in \`flags\`.`,
            },
            documentPart(buffer, mime, filePath),
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "compliance_audit",
          strict: true,
          schema: auditSchema,
        },
      },
    });
    const raw = completion.choices[0]?.message?.content;

    if (!raw) {
      return NextResponse.json(
        { error: "Compliance Auditor returned an empty response." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      parsed: JSON.parse(raw),
      raw,
    });
  } catch (auditError) {
    const message =
      auditError instanceof Error
        ? auditError.message
        : "Compliance Auditor could not audit this document.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
