import { NextRequest, NextResponse } from "next/server";
import { initOrder, confirmOrder } from "@/lib/bap-client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action || "init";

    if (!body.transaction_id || !body.bpp_id || !body.bpp_uri) {
      return NextResponse.json(
        { error: { code: "VALIDATION", message: "transaction_id, bpp_id, and bpp_uri are required" } },
        { status: 400 }
      );
    }

    if (action === "init") {
      const result = await initOrder({
        transaction_id: body.transaction_id,
        bpp_id: body.bpp_id,
        bpp_uri: body.bpp_uri,
        domain: body.domain,
        billing: body.billing,
        fulfillment: body.fulfillment,
      });
      return NextResponse.json(result);
    }

    if (action === "confirm") {
      const result = await confirmOrder({
        transaction_id: body.transaction_id,
        bpp_id: body.bpp_id,
        bpp_uri: body.bpp_uri,
        domain: body.domain,
        payment: body.payment,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: { code: "INVALID_ACTION", message: "action must be 'init' or 'confirm'" } },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: { code: "CHECKOUT_ERROR", message: "Checkout request failed", details: String(err) } },
      { status: 500 }
    );
  }
}
