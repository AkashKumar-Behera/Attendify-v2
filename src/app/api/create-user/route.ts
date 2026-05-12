import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { email, password, name, role, regNo, branch, semester } = await req.json();

    // 1. Verify if requester is authorized (Admin or Teacher)
    // In a real app, you would check the session token from the header
    // const authHeader = req.headers.get('Authorization');
    // ... verification logic ...

    // 2. Create the user in Firebase Auth
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: name,
    });

    // 3. Extract prefix from regNo if student
    let prefix = "";
    if (role === "student" && regNo) {
      prefix = regNo.substring(0, 8);
    }

    // 4. Save user metadata in Firestore
    await adminDb.collection("users").doc(userRecord.uid).set({
      uid: userRecord.uid,
      email,
      name,
      role,
      regNo: regNo || "",
      prefix,
      branch: branch || "",
      semester: semester || "",
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true, uid: userRecord.uid });
  } catch (error: any) {
    console.error("Error creating user:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
