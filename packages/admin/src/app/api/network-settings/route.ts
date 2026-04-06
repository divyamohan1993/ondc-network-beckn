import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import db from "@/lib/db";
import { networkPolicies } from "@ondc/shared";
import { requireRole, unauthorized } from "@/lib/api-helpers";

export async function GET() {
  const session = await requireRole("ADMIN");
  if (!session) return unauthorized();

  try {
    const policies = await db.select().from(networkPolicies);

    const settings: Record<string, any> = {};
    for (const p of policies) {
      settings[p.key] = { value: p.value, domain: p.domain, description: p.description, id: p.id };
    }

    return NextResponse.json({
      policies: settings,
      env: {
        BECKN_CORE_VERSION: process.env.BECKN_CORE_VERSION || "1.1.0",
        DOMAIN: process.env.DOMAIN || "ondc.dmj.one",
        REGISTRY_URL: process.env.REGISTRY_URL || "http://localhost:3001",
        GATEWAY_URL: process.env.GATEWAY_URL || "",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch network settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await requireRole("SUPER_ADMIN");
  if (!session) return unauthorized();

  try {
    const { policies: updates } = await request.json();

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: "policies array is required" }, { status: 400 });
    }

    const results = [];
    for (const { id, key, value, domain, description } of updates) {
      if (id) {
        const [updated] = await db
          .update(networkPolicies)
          .set({ value, domain, description, updated_at: new Date() })
          .where(eq(networkPolicies.id, id))
          .returning();
        results.push(updated);
      } else if (key) {
        const [created] = await db
          .insert(networkPolicies)
          .values({ key, value, domain, description })
          .returning();
        results.push(created);
      }
    }

    return NextResponse.json({ updated: results });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update network settings" }, { status: 500 });
  }
}
