import { NextRequest, NextResponse } from "next/server";
import { searchProducts, getOrderByTxnId } from "@/lib/bap-client";
import { guardApiRoute } from "@/lib/api-guard";

export async function POST(request: NextRequest) {
  const blocked = guardApiRoute(request);
  if (blocked) return blocked;

  try {
    const body = await request.json();
    const result = await searchProducts({
      query: body.query,
      city: body.city || "std:011",
      domain: body.domain || "ONDC:RET10",
      provider: body.provider,
      item: body.item,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: { code: "SEARCH_ERROR", message: "Search request failed", details: String(err) } },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const blocked = guardApiRoute(request);
  if (blocked) return blocked;

  const txn = request.nextUrl.searchParams.get("txn");
  if (!txn) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "txn query parameter is required" } },
      { status: 400 }
    );
  }

  try {
    const result = await getOrderByTxnId(txn);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: { code: "POLL_ERROR", message: "Failed to fetch search results", details: String(err) } },
      { status: 500 }
    );
  }
}
