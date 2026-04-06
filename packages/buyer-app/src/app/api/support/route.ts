import { NextRequest, NextResponse } from "next/server";
import { requestSupport } from "@/lib/bap-client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.transaction_id) {
      return NextResponse.json(
        { error: { code: "VALIDATION", message: "transaction_id is required" } },
        { status: 400 }
      );
    }

    // If we have bpp_id and bpp_uri, forward to BAP support API
    if (body.bpp_id && body.bpp_uri) {
      const result = await requestSupport({
        transaction_id: body.transaction_id,
        bpp_id: body.bpp_id,
        bpp_uri: body.bpp_uri,
        domain: body.domain,
        order_id: body.order_id,
        support: {
          ref_id: body.transaction_id,
          callback_phone: body.phone,
          phone: body.phone,
          email: body.email,
        },
      });
      return NextResponse.json(result);
    }

    // Store locally for issues where bpp details aren't known
    // In production this would go to an IGM complaint system
    return NextResponse.json({
      status: "received",
      transaction_id: body.transaction_id,
      issue_type: body.issue_type,
      message: "Support request recorded. We will contact you shortly.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: { code: "SUPPORT_ERROR", message: "Support request failed", details: String(err) } },
      { status: 500 }
    );
  }
}
