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
  Trophy,
  Scan
} from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { collection, query, where, getDocs, getCountFromServer } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { motion, AnimatePresence } from "framer-motion";
import { 
  PieChart, Pie, Cell, ResponsiveContainer, 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip 
} from 'recharts';

export default function DashboardPage() {
  const { userData } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [todaySchedule, setTodaySchedule] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any[]>([]);
  const [studentAnalytics, setStudentAnalytics] = useState<{
    percentage: number;
    totalPresent: number;
    totalSessions: number;
    subjectStats: any[];
  } | null>(null);

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

  // removed initializeStats hook

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

      // Fetch real stats
      let totalUsersCount = 0;
      try {
         const usersSnap = await getCountFromServer(collection(db, "users"));
         totalUsersCount = usersSnap.data().count;
      } catch (e) {
         console.error(e);
      }
      
      const baseStats = [
        { name: "Today's Classes", value: sorted.length.toString(), icon: Clock, color: "text-indigo-400", bg: "bg-indigo-500/10", border: "border-indigo-500/20" },
        { name: "Total Users", value: totalUsersCount.toString(), icon: Users, color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
        { name: "System Status", value: "Online", icon: ShieldCheck, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
        { name: "Notifications", value: "0", icon: AlertCircle, color: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20" },
      ];
      setStats(baseStats);

      if (userData?.role === 'student' && userData.regNo) {
        fetchStudentAnalytics();
      }

    } catch (error) {
      console.error("Dashboard Fetch Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentAnalytics = async () => {
    try {
      // 1. Get all sessions for this batch
      const sessionsQ = query(
        collection(db, "smartboardSessions"),
        where("metadata.branch", "==", userData.branch),
        where("metadata.semester", "==", userData.semester),
        where("status", "in", ["marking-attendance", "completed"])
      );
      const sessionsSnap = await getDocs(sessionsQ);
      const sessionMap = new Map();
      sessionsSnap.docs.forEach(doc => sessionMap.set(doc.id, doc.data()));

      // 2. Get student's attendance records
      const attendanceQ = query(
        collection(db, "attendance"),
        where("regNo", "==", userData.regNo)
      );
      const attendanceSnap = await getDocs(attendanceQ);
      const attendanceData = attendanceSnap.docs.map(doc => doc.data());

      const subjectStatsMap: any = {};
      sessionMap.forEach((sess, id) => {
        const sub = sess.metadata.subject;
        if (!subjectStatsMap[sub]) {
          subjectStatsMap[sub] = { name: sub, total: 0, present: 0 };
        }
        subjectStatsMap[sub].total += 1;
        
        const record = attendanceData.find(a => a.sessionId === id);
        if (record && record.status === 'present') {
          subjectStatsMap[sub].present += 1;
        }
      });

      const subjectStatsArray = Object.values(subjectStatsMap).map((s: any) => ({
        ...s,
        percentage: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0
      }));

      const totalPresent = attendanceData.filter(a => a.status === 'present').length;
      const totalSessions = sessionMap.size;
      const overallPercentage = totalSessions > 0 ? Math.round((totalPresent / totalSessions) * 100) : 0;

      setStudentAnalytics({
        percentage: overallPercentage,
        totalPresent,
        totalSessions,
        subjectStats: subjectStatsArray
      });
    } catch (error) {
      console.error("Analytics Error:", error);
    }
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

      {/* Main Grid: Analytics & Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
        
        {/* Left Column: Analytics (Student Only) */}
        {userData?.role === 'student' && (
          <div className="lg:col-span-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               {/* Gauge Chart Card */}
               <div className="bg-slate-900 p-6 rounded-lg border border-slate-800 shadow-xl flex flex-col items-center">
                  <div className="w-full flex justify-between items-center mb-4">
                     <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Attendance Health</h4>
                     <TrendingUp size={16} className="text-emerald-400" />
                  </div>
                  <div className="relative w-full h-[180px]">
                     <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                           <Pie
                              data={[
                                 { value: studentAnalytics?.percentage || 0 },
                                 { value: 100 - (studentAnalytics?.percentage || 0) }
                              ]}
                              cx="50%"
                              cy="100%"
                              startAngle={180}
                              endAngle={0}
                              innerRadius="110%"
                              outerRadius="140%"
                              paddingAngle={0}
                              dataKey="value"
                           >
                              <Cell fill={studentAnalytics && studentAnalytics.percentage >= 75 ? "#10b981" : "#f43f5e"} />
                              <Cell fill="#1e293b" />
                           </Pie>
                        </PieChart>
                     </ResponsiveContainer>
                     <div className="absolute inset-0 flex flex-col items-center justify-end pb-2">
                        <span className="text-4xl font-black text-white">{studentAnalytics?.percentage || 0}%</span>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Total Average</span>
                     </div>
                  </div>
                  <div className="grid grid-cols-2 w-full gap-4 mt-6">
                     <div className="text-center p-3 bg-slate-950 rounded-xl border border-slate-800">
                        <p className="text-lg font-black text-white">{studentAnalytics?.totalPresent || 0}</p>
                        <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Attended</p>
                     </div>
                     <div className="text-center p-3 bg-slate-950 rounded-xl border border-slate-800">
                        <p className="text-lg font-black text-white">{studentAnalytics?.totalSessions || 0}</p>
                        <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Total Sessions</p>
                     </div>
                  </div>
               </div>

               {/* Bar Graph Card */}
               <div className="bg-slate-900 p-6 rounded-lg border border-slate-800 shadow-xl flex flex-col">
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 text-center">Subject-wise Analytics</h4>
                  <div className="flex-1 h-[200px]">
                     <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={studentAnalytics?.subjectStats || []}>
                           <XAxis 
                              dataKey="name" 
                              hide 
                           />
                           <YAxis hide domain={[0, 100]} />
                           <RechartsTooltip 
                              cursor={{fill: 'transparent'}}
                              content={({ active, payload }) => {
                                 if (active && payload && payload.length) {
                                    return (
                                       <div className="bg-slate-950 border border-slate-800 p-2 rounded shadow-xl">
                                          <p className="text-[10px] font-black text-white uppercase">{payload[0].payload.name}</p>
                                          <p className="text-[10px] font-bold text-blue-400">{payload[0].value}% Attendance</p>
                                       </div>
                                    );
                                 }
                                 return null;
                              }}
                           />
                           <Bar dataKey="percentage" radius={[4, 4, 0, 0]}>
                              {(studentAnalytics?.subjectStats || []).map((entry, index) => (
                                 <Cell key={`cell-${index}`} fill={entry.percentage >= 75 ? "#3b82f6" : "#f43f5e"} fillOpacity={0.8} />
                              ))}
                           </Bar>
                        </BarChart>
                     </ResponsiveContainer>
                  </div>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                     {(studentAnalytics?.subjectStats || []).slice(0, 3).map((sub, i) => (
                        <span key={i} className="px-2 py-1 bg-slate-950 border border-slate-800 rounded text-[8px] font-bold text-slate-400 uppercase">
                           {sub.name.substring(0, 8)}...
                        </span>
                     ))}
                  </div>
               </div>
            </div>

            {/* Current Class (Moved here for Student) */}
            <div className="bg-slate-900 p-6 rounded-lg border border-slate-800 shadow-xl h-fit">
               <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                     <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-ping"></div>
                     <h4 className="text-lg font-semibold text-white">Current Class</h4>
                  </div>
               </div>

               {loading ? (
                  <div className="flex flex-col items-center justify-center gap-4 py-12">
                     <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
               ) : currentSession ? (
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                     <div className="space-y-6 flex-1">
                        <div>
                           <h2 className="text-3xl font-bold text-white leading-tight">{currentSession.subject}</h2>
                           <p className="text-sm text-slate-400 mt-2 flex items-center gap-2">
                              <Database size={16} className="text-indigo-400" />
                              Active Session Detected
                           </p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                           <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                              <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Teacher</p>
                              <p className="text-sm font-bold text-white truncate">{currentSession.teacher}</p>
                           </div>
                           <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                              <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Room</p>
                              <p className="text-sm font-bold text-white truncate">{currentSession.room}</p>
                           </div>
                        </div>
                     </div>
                     <div className="flex flex-col items-center gap-4 p-6 bg-slate-950 rounded-xl border border-slate-800 min-w-[200px] shadow-2xl">
                        <div className="text-center">
                           <p className="text-2xl font-black text-white">{currentSession.startTime}</p>
                           <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest my-1">To</p>
                           <p className="text-xl font-black text-slate-400">{currentSession.endTime}</p>
                        </div>
                        <Link href="/dashboard/scan" className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 transition-all shadow-lg shadow-blue-900/40">
                           Initialize Scan
                           <Scan size={16} />
                        </Link>
                     </div>
                  </div>
               ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                     <div className="p-4 bg-slate-950 rounded-full border border-slate-800 mb-4 text-slate-700">
                        <Calendar size={32} />
                     </div>
                     <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest">No Active Class</h4>
                     <p className="text-xs text-slate-600 mt-1 uppercase font-bold tracking-tighter">Scanning window is currently offline</p>
                  </div>
               )}
            </div>
          </div>
        )}

        {/* Right Column: Schedule & Quick Info */}
        <div className={`${userData?.role === 'student' ? 'lg:col-span-4' : 'lg:col-span-12'} space-y-6`}>
          {/* Schedule Card */}
          <div className="bg-slate-900 p-6 rounded-lg border border-slate-800 shadow-xl flex flex-col h-full max-h-[700px]">
            <div className="flex items-center justify-between mb-8">
               <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-600/10 rounded-lg border border-blue-500/20">
                     <Calendar className="text-blue-500" size={20} />
                  </div>
                  <h4 className="text-sm font-bold text-white uppercase tracking-[0.2em]">Today's Protocol</h4>
               </div>
               <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{todaySchedule.length} Slots</span>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-4 no-scrollbar">
               {todaySchedule.length > 0 ? todaySchedule.map((session, idx) => (
                  <div 
                     key={session.id} 
                     className={`p-4 rounded-lg border transition-all duration-300 ${session === currentSession ? 'bg-blue-600/10 border-blue-500/30 shadow-[0_0_20px_rgba(37,99,235,0.05)]' : 'bg-slate-950 border-slate-800 hover:border-slate-700 hover:translate-x-1'}`}
                  >
                     <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                           <Clock size={12} className={session === currentSession ? 'text-blue-400' : 'text-slate-500'} />
                           <span className={`text-[10px] font-black tracking-widest ${session === currentSession ? 'text-blue-400' : 'text-slate-400'}`}>
                              {session.startTime} - {session.endTime}
                           </span>
                        </div>
                        {session === currentSession && (
                           <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-500/20 rounded text-[8px] font-black text-blue-400 uppercase tracking-tighter animate-pulse">
                              <span className="w-1 h-1 bg-blue-400 rounded-full"></span>
                              Active
                           </div>
                        )}
                     </div>
                     <h5 className="text-sm font-black text-white uppercase tracking-tight mb-2">{session.subject}</h5>
                     <div className="flex items-center justify-between">
                        <p className="text-[9px] text-slate-500 font-bold uppercase flex items-center gap-1.5">
                           <MapPin size={10} className="text-slate-600" />
                           Terminal {session.room}
                        </p>
                        <p className="text-[9px] text-slate-600 font-bold uppercase">{session.teacher.split(' ')[0]}</p>
                     </div>
                  </div>
               )) : (
                  <div className="flex h-full flex-col items-center justify-center py-20 opacity-20">
                     <Calendar size={48} className="mb-4" />
                     <p className="text-xs font-black uppercase tracking-widest">No Deployments Scheduled</p>
                  </div>
               )}
            </div>

            <Link href="/dashboard/timetable" className="mt-8 flex items-center justify-center gap-3 py-4 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl border border-slate-800 transition-all text-[10px] font-black uppercase tracking-widest shadow-xl">
               Full Registry Access
               <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
