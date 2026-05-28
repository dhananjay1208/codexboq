import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { openai } from "@/lib/openai";

const normalizeBoqRequest = z.object({
  headers: z.array(z.string()).min(1),
  sample_rows: z.array(z.array(z.string())).min(1),
});

const boqMapSchema = {
  type: "object",
  properties: {
    column_map: {
      type: "object",
      properties: {
        sl_no: { type: "integer" },
        description: { type: "integer" },
        unit: { type: "integer" },
        quantity: { type: "integer" },
        rate: { type: "integer" },
        amount: { type: "integer" },
      },
      required: ["sl_no", "description", "unit", "quantity", "rate", "amount"],
      additionalProperties: false,
    },
    header_row_index: { type: "integer" },
    headline_pattern: {
      type: "string",
      enum: ["whole_number", "letter_suffix", "no_sl_no_under_headline"],
    },
    confidence: { type: "number" },
    notes: { type: "string" },
  },
  required: [
    "column_map",
    "header_row_index",
    "headline_pattern",
    "confidence",
    "notes",
  ],
  additionalProperties: false,
} as const;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = normalizeBoqRequest.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid BOQ normalization payload." },
      { status: 400 }
    );
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "boq_map",
          strict: true,
          schema: boqMapSchema,
        },
      },
      messages: [
        {
          role: "system",
          content:
            "You parse Indian construction BOQ Excel files. Identify which 0-based column index maps to each canonical field (-1 if absent). Detect the header row. Classify how headlines vs line items are distinguished: whole_number = headline rows have integer S.No (1,2,3) and line items have decimal (1.1,1.2); letter_suffix = items use letters (7.a, 7.b); no_sl_no_under_headline = headlines have no quantity/rate and line items have no S.No.",
        },
        {
          role: "user",
          content: JSON.stringify({
            instruction:
              "Return a strict JSON mapping. header_row_index must be the 0-based row index within sample_rows.",
            headers: parsed.data.headers,
            sample_rows: parsed.data.sample_rows,
          }),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: "The BOQ Normalizer returned an empty response." },
        { status: 502 }
      );
    }

    return NextResponse.json(JSON.parse(content));
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The BOQ Normalizer could not analyze this workbook.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
