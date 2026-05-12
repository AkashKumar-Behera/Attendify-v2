"use client";

import { useAuth } from "@/lib/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  Settings, 
  LogOut, 
  QrCode,
  UserPlus,
  Menu,
  X,
  Scan,
  Bell
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { motion } from "framer-motion";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, userData, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#020617]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login");
  };

  const navItems = [
    { name: "Overview", icon: LayoutDashboard, href: "/dashboard", roles: ["admin", "teacher", "student"] },
    { name: "Users", icon: UserPlus, href: "/dashboard/users", roles: ["admin", "teacher"] },
    { name: "Timetable", icon: Calendar, href: "/dashboard/timetable", roles: ["admin", "teacher", "student"] },
    { name: "Attendance", icon: QrCode, href: "/dashboard/scan", roles: ["teacher", "student"] },
    { name: "Settings", icon: Settings, href: "/dashboard/settings", roles: ["admin", "teacher", "student"] },
  ];

  const filteredNavItems = navItems.filter(item => item.roles.includes(userData?.role));

  return (
    <div className="flex min-h-screen bg-[#020617] text-slate-200 overflow-x-hidden selection:bg-blue-500/30 font-sans">
      {/* Mobile Backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-md z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-[#0f172a] border-r border-slate-800/50
        transform transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/40">
                  <QrCode size={18} className="text-white" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">Attendify</h2>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white">
              <X size={20} />
            </button>
          </div>
          
          <div className="mt-6 flex items-center space-x-2 p-2 bg-slate-900/50 rounded-lg border border-slate-800/50">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <p className="text-[10px] text-blue-400 uppercase tracking-widest font-black">
                {userData?.role} Portal
            </p>
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-1 mt-2">
          {filteredNavItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setIsSidebarOpen(false)}
                className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 group ${
                  isActive 
                    ? 'bg-blue-600/10 text-blue-500 border border-blue-500/20 shadow-[0_0_20px_rgba(37,99,235,0.1)]' 
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                }`}
              >
                <item.icon size={18} className={`${isActive ? 'text-blue-500' : 'group-hover:text-blue-500'} transition-colors`} />
                <span className="text-sm font-bold">{item.name}</span>
                {isActive && (
                  <motion.div 
                    layoutId="activeTab"
                    className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(37,99,235,1)]" 
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 mt-auto">
          <button
            onClick={handleLogout}
            className="flex items-center space-x-3 w-full px-4 py-3 text-slate-500 hover:text-red-500 rounded-lg transition-all"
          >
            <LogOut size={18} />
            <span className="text-sm font-bold">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Header */}
        <header className="h-16 glass-header flex items-center justify-between px-4 md:px-8 sticky top-0 z-30">
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 text-slate-400 hover:bg-slate-800 rounded-lg transition"
            >
              <Menu size={20} />
            </button>
            <div className="hidden sm:block">
              <h1 className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                {userData?.role === 'student' ? 'Student Dashboard' : 'Faculty Dashboard'}
              </h1>
            </div>
          </div>

          <div className="flex items-center space-x-3 md:space-x-4">
            {userData?.role !== 'admin' && (
              <Link 
                href="/dashboard/scan" 
                className="flex items-center justify-center w-10 h-10 bg-blue-600/10 text-blue-500 rounded-lg hover:bg-blue-600 hover:text-white transition-all duration-300 border border-blue-500/20 shadow-lg shadow-blue-900/20 group"
                title="Quick Scan"
              >
                <Scan size={20} className="group-hover:scale-110 transition-transform" />
              </Link>
            )}

            <button className="hidden sm:flex items-center justify-center w-10 h-10 bg-slate-900 text-slate-400 rounded-lg hover:text-white transition-all border border-slate-800">
               <Bell size={18} />
            </button>

            <div className="h-8 w-[1px] bg-slate-800 mx-1 hidden sm:block"></div>

            <div className="flex items-center space-x-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-white leading-none">{userData?.name?.split(' ')[0]}</p>
                <p className="text-[9px] text-slate-500 font-black uppercase tracking-tighter mt-1">{userData?.regNo || "FACULTY"}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white text-sm font-black shadow-lg shadow-blue-900/20 border border-blue-400/20">
                {userData?.name?.charAt(0)}
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto no-scrollbar pb-24 md:pb-8 bg-[#020617]">
          <div className="max-w-6xl mx-auto p-4 md:p-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
