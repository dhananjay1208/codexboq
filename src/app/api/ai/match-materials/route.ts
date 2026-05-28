import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { openai } from "@/lib/openai";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

const matchMaterialsRequest = z.object({
  candidates: z
    .array(
      z.object({
        description: z.string().min(1),
        unit: z.string().min(1),
      })
    )
    .min(1),
});

const matchesSchema = {
  type: "object",
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          candidate_index: { type: "integer" },
          material_id: { type: ["string", "null"] },
          suggested_new: {
            type: ["object", "null"],
            properties: {
              category: { type: "string" },
              name: { type: "string" },
              unit: { type: "string" },
            },
            required: ["category", "name", "unit"],
            additionalProperties: false,
          },
          confidence: { type: "number" },
          reasoning: { type: "string" },
        },
        required: [
          "candidate_index",
          "material_id",
          "suggested_new",
          "confidence",
          "reasoning",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["matches"],
  additionalProperties: false,
} as const;

function normalizeMaterialId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed.toLowerCase() === "null") {
    return null;
  }

  return trimmed;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = matchMaterialsRequest.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid material matching payload." },
      { status: 400 }
    );
  }

  const { data: materials, error } = await supabaseAdmin()
    .from("master_materials")
    .select("id,category,name,unit")
    .eq("is_active", true)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "matches",
          strict: true,
          schema: matchesSchema,
        },
      },
      messages: [
        {
          role: "system",
          content:
            "For each candidate line item, find the best matching master material. Compare description and unit. If confidence < 0.6 set material_id=null and propose suggested_new. Always return exactly one entry per candidate.",
        },
        {
          role: "user",
          content: JSON.stringify({
            candidates: parsed.data.candidates,
            master_materials: materials ?? [],
          }),
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;

    if (!raw) {
      return NextResponse.json(
        { error: "Material Matcher returned an empty response." },
        { status: 502 }
      );
    }

    const parsedMatches = JSON.parse(raw) as {
      matches: Array<{
        candidate_index: number;
        material_id: unknown;
        suggested_new: unknown;
        confidence: number;
        reasoning: string;
      }>;
    };

    return NextResponse.json({
      parsed: {
        matches: parsedMatches.matches.map((match) => ({
          ...match,
          material_id: normalizeMaterialId(match.material_id),
        })),
      },
      raw,
    });
  } catch (matchError) {
    const message =
      matchError instanceof Error
        ? matchError.message
        : "Material Matcher could not process candidates.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
