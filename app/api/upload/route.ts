import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth/session";

// WhatsApp rejects most media above this size.
const MAX_UPLOAD_BYTES = 16 * 1024 * 1024;

export async function POST(request: Request) {
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "File is too large. The limit is 16 MB." },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Create safe filename
    const ext = path.extname(file.name);
    const filename = `${randomUUID()}${ext}`;
    
    // Ensure directory exists
    const uploadDir = path.join(process.cwd(), "public", "uploads", "whatsapp");
    await mkdir(uploadDir, { recursive: true });
    
    // Write file
    const filepath = path.join(uploadDir, filename);
    await writeFile(filepath, buffer);
    
    // Return the public URL and mime type
    return NextResponse.json({
      success: true,
      mediaUrl: `/uploads/whatsapp/${filename}`,
      mediaMimeType: file.type,
      fileName: file.name
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}
