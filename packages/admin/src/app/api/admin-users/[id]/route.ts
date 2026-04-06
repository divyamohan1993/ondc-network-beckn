import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import db from "@/lib/db";
import { adminUsers } from "@ondc/shared";
import { requireRole, unauthorized } from "@/lib/api-helpers";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireRole("ADMIN");
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    const [user] = await db
      .select({
        id: adminUsers.id,
        email: adminUsers.email,
        name: adminUsers.name,
        role: adminUsers.role,
        is_active: adminUsers.is_active,
        created_at: adminUsers.created_at,
        last_login: adminUsers.last_login,
      })
      .from(adminUsers)
      .where(eq(adminUsers.id, id));

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireRole("SUPER_ADMIN");
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    const { name, role, is_active } = await request.json();

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name;
    if (role !== undefined) {
      const validRoles = ["SUPER_ADMIN", "ADMIN", "VIEWER"];
      if (!validRoles.includes(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      updates.role = role;
    }
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const [updated] = await db
      .update(adminUsers)
      .set(updates)
      .where(eq(adminUsers.id, id))
      .returning({
        id: adminUsers.id,
        email: adminUsers.email,
        name: adminUsers.name,
        role: adminUsers.role,
        is_active: adminUsers.is_active,
      });

    if (!updated) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireRole("SUPER_ADMIN");
  if (!session) return unauthorized();

  try {
    const { id } = await params;

    const [deactivated] = await db
      .update(adminUsers)
      .set({ is_active: false })
      .where(eq(adminUsers.id, id))
      .returning({ id: adminUsers.id, is_active: adminUsers.is_active });

    if (!deactivated) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to deactivate user" }, { status: 500 });
  }
}
