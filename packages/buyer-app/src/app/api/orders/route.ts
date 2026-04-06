import { NextRequest, NextResponse } from "next/server";
import { getOrderByTxnId, getOrderStatus } from "@/lib/bap-client";
import { guardApiRoute } from "@/lib/api-guard";

export async function GET(request: NextRequest) {
  const blocked = guardApiRoute(request);
  if (blocked) return blocked;

  try {
    const txnId = request.nextUrl.searchParams.get("txn");

    if (txnId) {
      // Get specific order by transaction ID
      const result = await getOrderByTxnId(txnId);
      return NextResponse.json(result);
    }

    // List all orders - in a real app this would need user auth
    // For now return empty array since BAP doesn't have a list endpoint
    return NextResponse.json({ orders: [] });
  } catch (err) {
    return NextResponse.json(
      { error: { code: "ORDERS_ERROR", message: "Failed to fetch orders", details: String(err) } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.transaction_id || !body.bpp_id || !body.bpp_uri) {
      return NextResponse.json(
        { error: { code: "VALIDATION", message: "transaction_id, bpp_id, and bpp_uri are required" } },
        { status: 400 }
      );
    }

    const result = await getOrderStatus({
      transaction_id: body.transaction_id,
      bpp_id: body.bpp_id,
      bpp_uri: body.bpp_uri,
      domain: body.domain,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: { code: "STATUS_ERROR", message: "Failed to get order status", details: String(err) } },
      { status: 500 }
    );
  }
}
