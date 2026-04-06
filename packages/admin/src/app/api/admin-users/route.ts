import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import bcrypt from "bcrypt";
import db from "@/lib/db";
import { adminUsers } from "@ondc/shared";
import { requireRole, unauthorized } from "@/lib/api-helpers";

export async function GET() {
  const session = await requireRole("SUPER_ADMIN");
  if (!session) return unauthorized();

  try {
    const users = await db
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
      .orderBy(desc(adminUsers.created_at));

    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch admin users" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireRole("SUPER_ADMIN");
  if (!session) return unauthorized();

  try {
    const { email, name, password, role } = await request.json();

    if (!email || !name || !password) {
      return NextResponse.json({ error: "email, name, and password are required" }, { status: 400 });
    }

    const validRoles = ["SUPER_ADMIN", "ADMIN", "VIEWER"];
    if (role && !validRoles.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const [created] = await db
      .insert(adminUsers)
      .values({ email, name, password_hash, role: role || "VIEWER" })
      .returning({
        id: adminUsers.id,
        email: adminUsers.email,
        name: adminUsers.name,
        role: adminUsers.role,
        is_active: adminUsers.is_active,
        created_at: adminUsers.created_at,
      });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    if (error?.code === "23505") {
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create admin user" }, { status: 500 });
  }
}
