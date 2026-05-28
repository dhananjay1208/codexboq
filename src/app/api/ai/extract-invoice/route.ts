import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { openai } from "@/lib/openai";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

const extractInvoiceRequest = z.object({
  file_path: z.string().min(1),
  mime: z.string().min(1),
});

const invoiceSchema = {
  type: "object",
  properties: {
    vendor_name: { type: ["string", "null"] },
    vendor_gstin: { type: ["string", "null"] },
    invoice_number: { type: ["string", "null"] },
    invoice_date: { type: ["string", "null"] },
    total_amount: { type: ["number", "null"] },
    line_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          hsn_code: { type: ["string", "null"] },
          quantity: { type: "number" },
          unit: { type: "string" },
          rate: { type: ["number", "null"] },
          gst_rate: { type: ["number", "null"] },
          amount_with_gst: { type: ["number", "null"] },
        },
        required: [
          "description",
          "hsn_code",
          "quantity",
          "unit",
          "rate",
          "gst_rate",
          "amount_with_gst",
        ],
        additionalProperties: false,
      },
    },
  },
  required: [
    "vendor_name",
    "vendor_gstin",
    "invoice_number",
    "invoice_date",
    "total_amount",
    "line_items",
  ],
  additionalProperties: false,
} as const;

type PdfPage = {
  getTextContent(): Promise<{
    items: Array<{
      str?: string;
      transform?: number[];
    }>;
  }>;
};

type PdfDocument = {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
  destroy(): Promise<void>;
};

type PdfLoadingTask = {
  promise: Promise<PdfDocument>;
};

const invoicePrompt =
  "Extract structured data from this Indian construction supplier invoice for GRN creation. Most important: capture invoice number, invoice date, supplier/vendor name, every material description, quantity, and unit exactly as shown. Preserve the complete invoice number exactly, including all digits, slashes, dashes, and year suffixes. Amounts, rates, and GST are useful but secondary; set missing numeric secondary fields to null. Dates must be converted to YYYY-MM-DD. Exclude tax summary rows, bank details, terms, transport notes, and totals from line_items. Keep each real material line separate.";

async function loadPdf(pdfBuffer: Buffer) {
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

  return pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    isEvalSupported: false,
  }).promise;
}

async function extractPdfText(pdfBuffer: Buffer) {
  const document = await loadPdf(pdfBuffer);
  const pageTexts: string[] = [];

  try {
    const pagesToRead = Math.min(document.numPages, 3);
    for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = new Map<number, string[]>();

      for (const item of content.items) {
        const text = item.str?.trim();
        if (!text) continue;
        const y = Math.round(item.transform?.[5] ?? 0);
        lines.set(y, [...(lines.get(y) ?? []), text]);
      }

      pageTexts.push(
        Array.from(lines.entries())
          .sort((a, b) => b[0] - a[0])
          .map(([, parts]) => parts.join(" "))
          .join("\n")
      );
    }
  } finally {
    await document.destroy();
  }

  return pageTexts.join("\n\n--- PAGE BREAK ---\n\n").trim();
}

async function createInvoiceData(file: Blob, mime: string) {
  const buffer = Buffer.from(await file.arrayBuffer());

  if (mime === "application/pdf" || mime.includes("pdf")) {
    const text = await extractPdfText(buffer).catch(() => "");
    if (text.replace(/\s+/g, " ").length > 120) {
      return { type: "text" as const, text };
    }

    return {
      type: "pdf" as const,
      fileData: `data:application/pdf;base64,${buffer.toString("base64")}`,
    };
  }

  if (mime.startsWith("image/")) {
    return {
      type: "image" as const,
      dataUrl: `data:${mime};base64,${buffer.toString("base64")}`,
    };
  }

  throw new Error(`Unsupported invoice mime type: ${mime}`);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = extractInvoiceRequest.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid invoice extraction payload." },
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
      { error: error?.message ?? "Could not download invoice file." },
      { status: 404 }
    );
  }

  try {
    const invoiceData = await createInvoiceData(file, mime);
    if (invoiceData.type === "pdf") {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await openai.responses.create({
          model: "gpt-4o",
          temperature: 0,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: invoicePrompt,
                },
                {
                  type: "input_file",
                  filename: "invoice.pdf",
                  file_data: invoiceData.fileData,
                  detail: "high",
                },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "invoice",
              strict: true,
              schema: invoiceSchema,
            },
          },
        });
        const raw = response.output_text;

        if (raw) {
          return NextResponse.json({
            parsed: JSON.parse(raw),
            raw,
          });
        }
      }

      return NextResponse.json(
        { error: "Invoice Vision returned an empty response." },
        { status: 502 }
      );
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      messages: [
        {
          role: "user",
          content:
            invoiceData.type === "text"
              ? `${invoicePrompt}\n\nInvoice text:\n${invoiceData.text}`
              : [
                  {
                    type: "text",
                    text: invoicePrompt,
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: invoiceData.dataUrl,
                      detail: "high",
                    },
                  },
                ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "invoice",
          strict: true,
          schema: invoiceSchema,
        },
      },
    });
    const raw = completion.choices[0]?.message?.content;

    if (!raw) {
      return NextResponse.json(
        { error: "Invoice Vision returned an empty response." },
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
        : "Invoice Vision could not extract this invoice.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
