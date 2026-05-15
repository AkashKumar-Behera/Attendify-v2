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
      let branch = userData?.branch;
      let semester = userData?.semester;

      // If student and branch/semester missing, derive from prefix
      if (userData?.role === 'student' && (!branch || !semester)) {
         const prefix = userData.regNo?.substring(0, 8); // Standard 8-char prefix
         if (prefix) {
            const mQuery = query(collection(db, "batchMappings"), where("prefix", "==", prefix));
            const mSnap = await getDocs(mQuery);
            if (!mSnap.empty) {
               const mapping = mSnap.docs[0].data();
               branch = mapping.branch;
               semester = mapping.semester;
            }
         }
      }

      if (userData?.role === 'teacher') {
        q = query(
          collection(db, "timetables"),
          where("day", "==", currentDay),
          where("teacher", "==", userData.name)
        );
      } else if (userData?.role === 'student' && branch && semester) {
        q = query(
          collection(db, "timetables"),
          where("day", "==", currentDay),
          where("branch", "==", branch),
          where("semester", "==", semester)
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
        fetchStudentAnalytics(branch, semester);
      }

    } catch (error) {
      console.error("Dashboard Fetch Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentAnalytics = async (branch?: string, semester?: string) => {
    try {
      const targetBranch = branch || userData?.branch;
      const targetSem = semester || userData?.semester;

      if (!targetBranch || !targetSem) return;

      // 1. Get all sessions for this batch
      // 1. Get official subjects from timetable
      const timetableQ = query(
        collection(db, "timetables"),
        where("branch", "==", targetBranch),
        where("semester", "==", targetSem)
      );
      const timetableSnap = await getDocs(timetableQ);
      const officialSubjects = new Set(timetableSnap.docs.map(doc => doc.data().subject).filter(Boolean));

      // 2. Get all sessions for this batch and filter by official subjects
      const sessionsQ = query(
        collection(db, "smartboardSessions"),
        where("metadata.branch", "==", targetBranch),
        where("metadata.semester", "==", targetSem),
        where("status", "in", ["marking-attendance", "completed"])
      );
      const sessionsSnap = await getDocs(sessionsQ);
      const sessionMap = new Map();
      sessionsSnap.docs.forEach(doc => {
        const data = doc.data();
        if (officialSubjects.has(data.metadata.subject)) {
          sessionMap.set(doc.id, data);
        }
      });

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

      // Sum up present counts from the subjectStatsMap for accurate total
      let totalPresent = 0;
      Object.values(subjectStatsMap).forEach((s: any) => {
        totalPresent += s.present;
      });
      
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
      {/* Top Row: Timetable (Left) & Attendance Gauge (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
        {/* Today's Protocol (Left) */}
        <div className="lg:col-span-8 flex flex-col">
          <div className="bg-slate-900 p-6 rounded-lg border border-slate-800 shadow-xl flex flex-col h-full min-h-[400px]">
            <div className="flex items-center justify-between mb-8">
               <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-600/10 rounded-lg border border-blue-500/20">
                     <Calendar className="text-blue-500" size={20} />
                  </div>
                  <h4 className="text-sm font-bold text-white uppercase tracking-[0.2em]">Today's Protocol</h4>
               </div>
               <div className="flex items-center gap-4">
                  <div className="flex flex-col items-end">
                    <span className="text-xl font-bold text-white tabular-nums">
                      {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </span>
                    <p className="text-[8px] font-medium text-emerald-400 uppercase tracking-widest">System Online</p>
                  </div>
                  <div className="h-8 w-px bg-slate-800 hidden sm:block"></div>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{todaySchedule.length} Slots</span>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-700 bg-slate-950/50 rounded-lg border border-dashed border-slate-800">
                     <Calendar size={40} className="mb-4 opacity-20" />
                     <p className="text-xs font-black uppercase tracking-widest">No Deployments Scheduled</p>
                     <p className="text-[10px] font-bold mt-1 opacity-50">Base logic is clear for today</p>
                  </div>
               )}
            </div>
          </div>
        </div>

        {/* Attendance Health Gauge (Right) */}
        <div className="lg:col-span-4 flex flex-col">
          <div className="bg-slate-900 p-8 rounded-lg border border-slate-800 shadow-xl flex flex-col items-center h-full justify-center min-h-[400px]">
            <div className="w-full flex justify-between items-center mb-8">
               <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Attendance Health</h4>
               <TrendingUp size={16} className="text-emerald-400" />
            </div>
            <div className="relative w-full h-[240px]">
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
                        <Cell fill={studentAnalytics && studentAnalytics.percentage >= 75 ? "#3b82f6" : "#f43f5e"} />
                        <Cell fill="#1e293b" />
                     </Pie>
                  </PieChart>
               </ResponsiveContainer>
               <div className="absolute inset-0 flex flex-col items-center justify-end pb-4">
                  <span className="text-6xl font-black text-white">{studentAnalytics?.percentage || 0}%</span>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">Total Average</span>
               </div>
            </div>
            <div className="grid grid-cols-2 w-full gap-4 mt-12">
               <div className="text-center p-4 bg-slate-950 rounded-xl border border-slate-800">
                  <p className="text-2xl font-black text-white">{studentAnalytics?.totalPresent || 0}</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Attended</p>
               </div>
               <div className="text-center p-4 bg-slate-950 rounded-xl border border-slate-800">
                  <p className="text-2xl font-black text-white">{studentAnalytics?.totalSessions || 0}</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Sessions</p>
               </div>
            </div>
          </div>
        </div>
      </div>
      {/* Subject-wise Analytics (Bottom Row) - Only for Students */}
      {userData?.role === 'student' && studentAnalytics && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-slate-900 p-6 md:p-8 rounded-lg border border-slate-800 shadow-xl"
        >
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-600/10 rounded-lg border border-indigo-500/20">
                <TrendingUp className="text-indigo-500" size={20} />
              </div>
              <h4 className="text-sm font-bold text-white uppercase tracking-[0.2em]">Subject-wise Analytics</h4>
            </div>
            <div className="flex items-center gap-2">
               <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest hidden sm:block">Performance Matrix</span>
            </div>
          </div>

          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={studentAnalytics.subjectStats}>
                <XAxis 
                  dataKey="name" 
                  stroke="#475569" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tick={{ fill: '#94a3b8', fontWeight: 700 }}
                  interval={0}
                  tickFormatter={(value) => value.length > 10 ? `${value.substring(0, 10)}...` : value}
                />
                <YAxis 
                  stroke="#475569" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tick={{ fill: '#94a3b8', fontWeight: 700 }}
                  domain={[0, 100]}
                />
                <RechartsTooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg shadow-2xl backdrop-blur-md">
                          <p className="text-[10px] font-black text-white uppercase tracking-widest mb-1">{data.name}</p>
                          <p className="text-xl font-black text-blue-400">{data.percentage}%</p>
                          <p className="text-[8px] font-bold text-slate-500 uppercase mt-1">
                            {data.present} / {data.total} Sessions
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar 
                  dataKey="percentage" 
                  radius={[4, 4, 0, 0]}
                  barSize={40}
                >
                  {studentAnalytics.subjectStats.map((entry: any, index: number) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.percentage >= 75 ? "#3b82f6" : "#f43f5e"} 
                      fillOpacity={0.8}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}

      {/* Teacher/Default Stats View (Optional fallback or simplified view) */}
      {userData?.role === 'teacher' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, idx) => (
            <div key={idx} className={`p-6 rounded-lg border ${stat.bg} ${stat.border} transition-all hover:scale-[1.02]`}>
              <div className="flex items-center justify-between mb-4">
                <stat.icon className={stat.color} size={20} />
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{stat.name}</span>
              </div>
              <p className="text-3xl font-black text-white">{stat.value}</p>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
