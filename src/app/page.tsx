import Link from "next/link";
import { GraduationCap, QrCode, MapPin, ShieldCheck } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 selection:bg-blue-500/30">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 md:px-8 py-6 max-w-7xl mx-auto">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/40">
            <QrCode size={18} className="text-white" />
          </div>
          <span className="text-xl md:text-2xl font-bold tracking-tight text-white">Attendify</span>
        </div>
        <div className="flex items-center space-x-3 md:space-x-4">
          <Link href="/login" className="px-4 py-2 md:px-6 md:py-2 rounded-lg font-semibold text-slate-300 hover:text-white hover:bg-slate-800/50 transition text-sm md:text-base">
            Login
          </Link>
          <Link href="/smartboard" className="px-4 py-2 md:px-6 md:py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-500 transition shadow-lg shadow-blue-900/20 text-sm md:text-base border border-blue-500/20">
            Smartboard Mode
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="px-6 md:px-8 py-16 md:py-24 max-w-5xl mx-auto text-center flex flex-col items-center justify-center min-h-[60vh]">
        <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-6 md:mb-8 tracking-tight leading-tight">
          Next-Gen Attendance <br className="hidden md:block" />
          <span className="text-blue-500">Verification System</span>
        </h1>
        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 md:mb-12 px-4 md:px-0">
          Secure, real-time, and fraud-proof attendance tracking for modern colleges using dynamic QR codes and geofencing.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto px-4 md:px-0">
          <Link href="/login" className="w-full sm:w-auto px-6 py-3.5 md:px-8 md:py-4 bg-blue-600 text-white rounded-lg font-bold text-base md:text-lg hover:bg-blue-500 transition shadow-lg shadow-blue-900/20 border border-blue-500/20">
            Open Dashboard
          </Link>
          <Link href="/smartboard" className="w-full sm:w-auto px-6 py-3.5 md:px-8 md:py-4 bg-[#0f172a] border border-slate-800 text-slate-200 rounded-lg font-bold text-base md:text-lg hover:border-slate-700 hover:bg-slate-800 transition">
            Launch Smartboard
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 md:px-8 py-16 md:py-24 bg-[#0f172a]/50 border-t border-slate-800/50">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          <div className="bg-[#0f172a] p-6 md:p-8 rounded-lg border border-slate-800 hover:border-slate-700 transition">
            <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-500 mb-6 border border-blue-500/20">
              <QrCode size={24} />
            </div>
            <h3 className="text-lg md:text-xl font-bold text-white mb-3">Dynamic QR Codes</h3>
            <p className="text-slate-400 text-sm md:text-base leading-relaxed">Anti-spoofing QR codes that refresh every 15 seconds to prevent photo sharing.</p>
          </div>
          <div className="bg-[#0f172a] p-6 md:p-8 rounded-lg border border-slate-800 hover:border-slate-700 transition">
            <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-500 mb-6 border border-blue-500/20">
              <MapPin size={24} />
            </div>
            <h3 className="text-lg md:text-xl font-bold text-white mb-3">Geofencing</h3>
            <p className="text-slate-400 text-sm md:text-base leading-relaxed">Students must be within 50 meters of the classroom to mark their attendance.</p>
          </div>
          <div className="bg-[#0f172a] p-6 md:p-8 rounded-lg border border-slate-800 hover:border-slate-700 transition">
            <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-500 mb-6 border border-blue-500/20">
              <ShieldCheck size={24} />
            </div>
            <h3 className="text-lg md:text-xl font-bold text-white mb-3">Strict Enrollment</h3>
            <p className="text-slate-400 text-sm md:text-base leading-relaxed">Only authorized teachers can create student accounts, eliminating fake profiles.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 md:py-10 text-center text-slate-500 text-sm border-t border-slate-800/50">
        <p>© 2026 Attendify V2. Built for smart education.</p>
      </footer>
    </div>
  );
}
