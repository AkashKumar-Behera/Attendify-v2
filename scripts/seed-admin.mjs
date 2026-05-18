import admin from "firebase-admin";
import dotenv from "dotenv";
import { readFileSync } from "fs";
import { join } from "path";

// Load .env.local
const envPath = join(process.cwd(), ".env.local");
const envConfig = dotenv.parse(readFileSync(envPath));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: envConfig.FIREBASE_PROJECT_ID,
      clientEmail: envConfig.FIREBASE_CLIENT_EMAIL,
      privateKey: envConfig.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();
const auth = admin.auth();

async function createMasterAdmin(email, password, name) {
  try {
    let uid;
    try {
      // 1. Try to Create User in Auth
      const userRecord = await auth.createUser({
        email,
        password,
        displayName: name,
      });
      uid = userRecord.uid;
      console.log(`Created new user: ${email}`);
    } catch (authError) {
      if (authError.code === "auth/email-already-exists") {
        // If user exists, get their UID
        const userRecord = await auth.getUserByEmail(email);
        uid = userRecord.uid;
        console.log(`User already exists, using existing UID: ${uid}`);
      } else {
        throw authError;
      }
    }

    // 2. Set/Update Admin Metadata in Firestore
    await db.collection("users").doc(uid).set({
      uid: uid,
      email,
      name,
      role: "admin", // Ensure Master Admin Role
      updatedAt: new Date(),
    }, { merge: true });

    console.log(`Successfully configured Master Admin: ${email}`);
  } catch (error) {
    console.error("Error configuring admin:", error.message);
  }
}

// EDIT THESE DETAILS
createMasterAdmin("admin@example.com", "defaultPassword123", "Admin User");

