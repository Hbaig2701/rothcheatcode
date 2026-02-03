import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/svg+xml",
];

// POST /api/settings/logo - Upload logo
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "File must be JPG, PNG, WebP, or SVG" },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File must be under 2MB" },
      { status: 400 }
    );
  }

  const ext = file.name.split(".").pop() || "png";
  const path = `${user.id}/logo.${ext}`;

  // Upload to storage (upsert to replace existing)
  const { error: uploadError } = await supabase.storage
    .from("logos")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    console.error("Error uploading logo:", uploadError);
    return NextResponse.json(
      { error: uploadError.message },
      { status: 500 }
    );
  }

  // Get public URL
  const {
    data: { publicUrl },
  } = supabase.storage.from("logos").getPublicUrl(path);

  // Update settings with logo URL (append cache-buster)
  const logoUrl = `${publicUrl}?t=${Date.now()}`;
  const { error: updateError } = await supabase
    .from("user_settings")
    .update({ logo_url: logoUrl })
    .eq("user_id", user.id);

  if (updateError) {
    console.error("Error updating logo URL:", updateError);
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: logoUrl });
}

// DELETE /api/settings/logo - Remove logo
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // List and remove all files in the user's logo folder
  const { data: files } = await supabase.storage.from("logos").list(user.id);

  if (files && files.length > 0) {
    const paths = files.map((f) => `${user.id}/${f.name}`);
    await supabase.storage.from("logos").remove(paths);
  }

  // Clear logo URL in settings
  const { error: updateError } = await supabase
    .from("user_settings")
    .update({ logo_url: null })
    .eq("user_id", user.id);

  if (updateError) {
    console.error("Error clearing logo URL:", updateError);
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
