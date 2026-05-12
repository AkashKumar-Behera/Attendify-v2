"use client";

import { useAuth } from "@/lib/AuthContext";
import { 
  Users, 
  Clock, 
  TrendingUp,
  AlertCircle,
  ArrowRight,
  Calendar,
  BookOpen,
  MapPin,
  ShieldCheck,
  Search,
  Database,
  ChevronRight,
  RefreshCw,
  Trophy
} from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { motion, AnimatePresence } from "framer-motion";

export default function DashboardPage() {
  const { userData } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [todaySchedule, setTodaySchedule] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any[]>([]);

  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const currentDay = days[currentTime.getDay()];

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (userData) {
      fetchTodayData();
    }
  }, [userData]);

  useEffect(() => {
    initializeStats();
  }, [todaySchedule]);

  const fetchTodayData = async () => {
    setLoading(true);
    try {
      let q;
      if (userData?.role === 'teacher') {
        q = query(
          collection(db, "timetables"),
          where("day", "==", currentDay),
          where("teacher", "==", userData.name)
        );
      } else if (userData?.role === 'student' && userData.branch && userData.semester) {
        q = query(
          collection(db, "timetables"),
          where("day", "==", currentDay),
          where("branch", "==", userData.branch),
          where("semester", "==", userData.semester)
        );
      } else {
        setLoading(false);
        return;
      }

      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const sorted = data.sort((a: any, b: any) => a.startTime.localeCompare(b.startTime));
      setTodaySchedule(sorted);
    } catch (error) {
      console.error("Dashboard Fetch Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const initializeStats = () => {
    const baseStats = [
      { name: "Today's Classes", value: todaySchedule.length.toString(), icon: Clock, color: "text-indigo-400", bg: "bg-indigo-500/10", border: "border-indigo-500/20" },
      { name: "Attendance Rate", value: "92%", icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
      { name: "Total Users", value: "450", icon: Users, color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
      { name: "Notifications", value: "0", icon: AlertCircle, color: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20" },
    ];
    setStats(baseStats);
  };

  const getCurrentSession = () => {
    const nowStr = currentTime.getHours().toString().padStart(2, '0') + ":" + currentTime.getMinutes().toString().padStart(2, '0');
    return todaySchedule.find(slot => nowStr >= slot.startTime && nowStr <= slot.endTime) || null;
  };

  const currentSession = getCurrentSession();

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto space-y-6 md:space-y-8 animate-in fade-in duration-500 pb-12"
    >
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl">
        <div className="flex items-center gap-4 md:gap-6">
          <div className="p-3 md:p-4 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
            <TrendingUp size={28} className="text-indigo-400" />
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white">Dashboard Overview</h2>
            <p className="text-sm text-slate-400 mt-1 flex items-center gap-2">
              <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span>
              {currentDay}, {currentTime.toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-start md:items-end">
          <div className="text-3xl md:text-4xl font-bold text-white tabular-nums flex items-baseline gap-1">
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
            <span className="text-lg md:text-xl text-slate-500">:{currentTime.getSeconds().toString().padStart(2, '0')}</span>
          </div>
          <p className="text-xs font-medium text-emerald-400 mt-1">System Online</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {stats.map((stat, idx) => (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.05 }}
            key={stat.name} 
          >
            <div className="bg-slate-900 p-6 rounded-lg border border-slate-800 hover:border-slate-700 transition shadow-lg h-full">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-lg ${stat.bg} ${stat.color} border ${stat.border}`}>
                  <stat.icon size={20} />
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-white tabular-nums">
                    {stat.name === "Today's Classes" ? todaySchedule.length : stat.value}
                  </span>
                </div>
              </div>
              <p className="text-sm font-medium text-slate-400">{stat.name}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        {/* Current Class */}
        <div className="lg:col-span-2">
          <div className="bg-slate-900 p-4 md:p-6 rounded-lg border border-slate-800 shadow-xl h-full flex flex-col">
            <div className="flex items-center justify-between mb-8">
               <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-ping"></div>
                  <h4 className="text-lg font-semibold text-white">Current Class</h4>
               </div>
            </div>

            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 min-h-[200px]">
                <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm text-slate-400">Loading schedule...</p>
              </div>
            ) : currentSession ? (
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 flex-1">
                <div className="space-y-6 flex-1">
                  <div>
                    <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight">{currentSession.subject}</h2>
                    <p className="text-sm text-slate-400 mt-2 flex items-center gap-2">
                      <Database size={16} className="text-indigo-400" />
                      Active Class Session
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                        <Users size={18} className="text-indigo-400" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-0.5">Teacher</p>
                        <p className="text-sm font-semibold text-white truncate">{currentSession.teacher}</p>
                      </div>
                    </div>
                    <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                        <MapPin size={18} className="text-purple-400" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-0.5">Room</p>
                        <p className="text-sm font-semibold text-white truncate">{currentSession.room}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-4 p-6 bg-slate-950 rounded-lg border border-slate-800 min-w-[200px]">
                   <div className="text-center">
                      <p className="text-2xl font-bold text-white">{currentSession.startTime}</p>
                      <p className="text-sm text-slate-500">to</p>
                      <p className="text-xl font-bold text-slate-300">{currentSession.endTime}</p>
                   </div>
                   <Link href="/dashboard/scan" className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-colors">
                      Start Scanning
                      <ArrowRight size={16} />
                   </Link>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center min-h-[200px] text-center">
                <div className="p-4 bg-slate-950 rounded-full border border-slate-800 mb-4">
                   <Calendar size={32} className="text-slate-600" />
                </div>
                <h4 className="text-lg font-semibold text-slate-300">No Active Class</h4>
                <p className="text-sm text-slate-500 mt-1">Check your schedule for the next class</p>
              </div>
            )}
          </div>
        </div>

        {/* Schedule */}
        <div className="bg-slate-900 p-4 md:p-6 rounded-lg border border-slate-800 shadow-xl flex flex-col h-[500px] lg:h-auto">
          <div className="flex items-center gap-3 mb-6">
             <div className="p-2.5 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
                <Calendar className="text-indigo-400" size={20} />
             </div>
             <h4 className="text-lg font-semibold text-white">Today's Schedule</h4>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
            {todaySchedule.length > 0 ? todaySchedule.map((session, idx) => (
              <div 
                key={session.id} 
                className={`p-4 rounded-lg border transition-all ${session === currentSession ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-slate-950 border-slate-800 hover:border-slate-700'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-semibold ${session === currentSession ? 'text-indigo-400' : 'text-slate-400'}`}>
                    {session.startTime} - {session.endTime}
                  </span>
                  {session === currentSession && <span className="px-2 py-0.5 bg-indigo-500/20 rounded text-[10px] font-bold text-indigo-400 uppercase">Active</span>}
                </div>
                <h5 className="text-sm font-bold text-white mb-1">{session.subject}</h5>
                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                  <MapPin size={12} /> {session.room}
                </p>
              </div>
            )) : (
              <div className="flex h-full flex-col items-center justify-center opacity-50">
                 <p className="text-sm text-slate-400">No classes scheduled today</p>
              </div>
            )}
          </div>

          <Link href="/dashboard/timetable" className="mt-6 flex items-center justify-center gap-2 py-3 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 transition-colors text-sm font-medium">
             View Full Schedule
             <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
