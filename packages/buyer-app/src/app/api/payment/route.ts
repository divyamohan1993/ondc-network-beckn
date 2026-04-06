import { NextRequest, NextResponse } from "next/server";
import { confirmOrder } from "@/lib/bap-client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.transaction_id || !body.bpp_id || !body.bpp_uri) {
      return NextResponse.json(
        { error: { code: "VALIDATION", message: "transaction_id, bpp_id, and bpp_uri are required" } },
        { status: 400 }
      );
    }

    const paymentMethod = body.payment_method || "cod";
    let paymentType = "ON-FULFILLMENT"; // COD
    let paymentStatus = "NOT-PAID";

    if (paymentMethod === "upi" || paymentMethod === "card") {
      paymentType = "ON-ORDER";
      paymentStatus = "PAID";
    }

    // Confirm the order via BAP with payment details
    const result = await confirmOrder({
      transaction_id: body.transaction_id,
      bpp_id: body.bpp_id,
      bpp_uri: body.bpp_uri,
      domain: body.domain,
      payment: {
        type: paymentType,
        status: paymentStatus,
        params: {
          transaction_id: body.payment_transaction_id || body.transaction_id,
          amount: body.amount,
          currency: "INR",
        },
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: { code: "PAYMENT_ERROR", message: "Payment processing failed", details: String(err) } },
      { status: 500 }
    );
  }
}
