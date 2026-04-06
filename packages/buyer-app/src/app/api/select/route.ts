import { NextRequest, NextResponse } from "next/server";
import { selectItems } from "@/lib/bap-client";
import { guardApiRoute } from "@/lib/api-guard";

export async function POST(request: NextRequest) {
  const blocked = guardApiRoute(request);
  if (blocked) return blocked;

  try {
    const body = await request.json();

    if (!body.bpp_id || !body.bpp_uri || !body.provider_id || !body.items?.length) {
      return NextResponse.json(
        { error: { code: "VALIDATION", message: "bpp_id, bpp_uri, provider_id, and items are required" } },
        { status: 400 }
      );
    }

    const result = await selectItems({
      transaction_id: body.transaction_id || "",
      bpp_id: body.bpp_id,
      bpp_uri: body.bpp_uri,
      provider_id: body.provider_id,
      items: body.items,
      domain: body.domain,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: { code: "SELECT_ERROR", message: "Select request failed", details: String(err) } },
      { status: 500 }
    );
  }
}
