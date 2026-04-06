import { NextRequest, NextResponse } from "next/server";

// Cart is managed client-side via localStorage.
// This route exists for server-side cart validation if needed.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const items = body.items || [];

    // Validate cart items have required fields
    const validated = items.filter(
      (item: { itemId?: string; providerId?: string; bppId?: string; price?: number }) =>
        item.itemId && item.providerId && item.bppId && typeof item.price === "number"
    );

    return NextResponse.json({
      items: validated,
      count: validated.length,
      valid: validated.length === items.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: { code: "CART_ERROR", message: "Cart validation failed", details: String(err) } },
      { status: 500 }
    );
  }
}
