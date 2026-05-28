import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { openai } from "@/lib/openai";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

const extractIssueRequest = z.object({
  file_path: z.string().min(1),
  mime: z.string().min(1),
});

const issueSchema = {
  type: "object",
  properties: {
    voucher_number: { type: ["string", "null"] },
    consumption_date: { type: ["string", "null"] },
    issued_to: { type: ["string", "null"] },
    site_hint: { type: ["string", "null"] },
    line_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string" },
          notes: { type: ["string", "null"] },
        },
        required: ["description", "quantity", "unit", "notes"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "voucher_number",
    "consumption_date",
    "issued_to",
    "site_hint",
    "line_items",
  ],
  additionalProperties: false,
} as const;

type PdfPage = {
  getViewport(options: { scale: number }): {
    width: number;
    height: number;
  };
  render(options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }): {
    promise: Promise<void>;
  };
};

type PdfDocument = {
  getPage(pageNumber: number): Promise<PdfPage>;
  destroy(): Promise<void>;
};

type PdfLoadingTask = {
  promise: Promise<PdfDocument>;
};

function bufferToDataUrl(buffer: Buffer, mime: string) {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function renderFirstPdfPage(pdfBuffer: Buffer) {
  const { createCanvas } = await import("@napi-rs/canvas");
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as {
    GlobalWorkerOptions: {
      workerSrc: string;
    };
    getDocument(options: {
      data: Uint8Array;
      isEvalSupported: boolean;
    }): PdfLoadingTask;
  };
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    path.join(
      process.cwd(),
      "node_modules",
      "pdfjs-dist",
      "legacy",
      "build",
      "pdf.worker.mjs"
    )
  ).href;
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    isEvalSupported: false,
  });
  const document = await loadingTask.promise;

  try {
    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height)
    );
    const context = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

    await page.render({ canvasContext: context, viewport }).promise;

    return canvas.toBuffer("image/png");
  } finally {
    await document.destroy();
  }
}

async function createIssueDataUrl(file: Blob, mime: string) {
  const buffer = Buffer.from(await file.arrayBuffer());

  if (mime === "application/pdf" || mime.includes("pdf")) {
    const pngBuffer = await renderFirstPdfPage(buffer);
    return bufferToDataUrl(pngBuffer, "image/png");
  }

  if (mime.startsWith("image/")) {
    return bufferToDataUrl(buffer, mime);
  }

  throw new Error(`Unsupported issue voucher mime type: ${mime}`);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = extractIssueRequest.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid material issue extraction payload." },
      { status: 400 }
    );
  }

  const { file_path: filePath, mime } = parsed.data;
  const { data: file, error } = await supabaseAdmin()
    .storage
    .from("boqai-docs")
    .download(filePath);

  if (error || !file) {
    return NextResponse.json(
      { error: error?.message ?? "Could not download issue voucher file." },
      { status: 404 }
    );
  }

  try {
    const dataUrl = await createIssueDataUrl(file, mime);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract structured data from this Indian construction material issue voucher. Issue vouchers record materials taken from store to a workstation. Identify the issue/voucher date, who/where it was issued to, and each material with quantity and unit. Dates in YYYY-MM-DD. If a field is missing, set to null.",
            },
            {
              type: "image_url",
              image_url: {
                url: dataUrl,
                detail: "high",
              },
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "material_issue",
          strict: true,
          schema: issueSchema,
        },
      },
    });
    const raw = completion.choices[0]?.message?.content;

    if (!raw) {
      return NextResponse.json(
        { error: "Material Issue Vision returned an empty response." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      parsed: JSON.parse(raw),
      raw,
    });
  } catch (extractionError) {
    const message =
      extractionError instanceof Error
        ? extractionError.message
        : "Material Issue Vision could not extract this voucher.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
