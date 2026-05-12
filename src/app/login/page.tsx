"use client";

import { useState } from "react";
import { auth, db } from "@/lib/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";
import { LogIn, ShieldCheck, QrCode, ArrowRight } from "lucide-react";
import { collection, query, where, getDocs } from "firebase/firestore";

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    let loginEmail = identifier;

    try {
      if (!identifier.includes("@")) {
        const cleanId = identifier.trim().toUpperCase();
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("regNo", "==", cleanId));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          setError("User not found");
          setLoading(false);
          return;
        }

        const userDoc = querySnapshot.docs[0].data();
        loginEmail = userDoc.email;
      }

      await signInWithEmailAndPassword(auth, loginEmail, password);
      router.push("/dashboard");
    } catch (err: any) {
      if (err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
        setError("Invalid credentials. Please try again.");
      } else {
        setError(err.message || "Authentication failed");
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#020617] p-4 font-sans selection:bg-blue-500/30">
      {/* Background Decorative Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      <div className="w-full max-w-lg bg-[#0f172a] rounded-lg border border-slate-800 p-6 md:p-10 shadow-2xl relative z-10">
        <div className="flex flex-col items-center mb-10">
          <div className="bg-blue-600 rounded-lg p-3 flex items-center justify-center shadow-lg shadow-blue-900/40 mb-4 text-white">
            <QrCode size={24} />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Welcome to Attendify</h1>
          <p className="text-slate-400 text-center mt-2 text-sm">
            Sign in to your account
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300 ml-1">
              Email or Registration No
            </label>
            <div className="relative">
               <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                className="w-full bg-[#020617] border border-slate-800 rounded-lg px-4 py-3.5 text-white focus:ring-2 focus:ring-blue-600 outline-none transition-all placeholder:text-slate-600 text-sm md:text-base"
                placeholder="F2302900xxxx or email"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300 ml-1">
              Password
            </label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-[#020617] border border-slate-800 rounded-lg px-4 py-3.5 text-white focus:ring-2 focus:ring-blue-600 outline-none transition-all placeholder:text-slate-600 text-sm md:text-base"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-lg text-sm font-medium text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 rounded-lg transition-all duration-200 disabled:opacity-50 flex items-center justify-center space-x-2 group text-sm md:text-base shadow-lg shadow-blue-900/20 border border-blue-500/20"
          >
            <span>{loading ? "Signing in..." : "Sign In"}</span>
            {!loading && <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-800 flex flex-col items-center gap-2">
           <div className="flex items-center space-x-2 text-slate-500">
              <ShieldCheck size={14} />
              <span className="text-xs font-medium">Secure Login</span>
           </div>
        </div>
      </div>
    </div>
  );
}
