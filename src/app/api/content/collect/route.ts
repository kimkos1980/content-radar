import { NextResponse } from "next/server";
import { collectContent } from "@/lib/content/contentCollector";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const secret = process.env.CONTENT_COLLECT_SECRET;

  if (!secret) {
    return false;
  }

  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");
  const authHeader = request.headers.get("authorization");

  return querySecret === secret || authHeader === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await collectContent();

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  return GET(request);
}
