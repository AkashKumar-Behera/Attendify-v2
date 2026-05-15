"use client";

import { useAuth } from "@/lib/AuthContext";
import { 
  Users, 
  Clock, 
  TrendingUp,
  AlertCircle,
  Calendar,
  MapPin,
  ShieldCheck,
  DoorOpen,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { collection, query, where, getDocs, getCountFromServer } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { motion } from "framer-motion";
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Cell, ResponsiveContainer, LabelList
} from 'recharts';

// ─── Animated Gauge (SVG-based, no Recharts flash) ────────────────────────────
function GaugeChart({ percentage }: { percentage: number }) {
  const [displayed, setDisplayed] = useState(0);
  const animRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  const color =
    percentage >= 75 ? "#22c55e" :
    percentage >= 45 ? "#eab308" :
    "#f43f5e";

  // Animate number counter
  useEffect(() => {
    const duration = 1200;
    startRef.current = null;
    const animate = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(eased * percentage));
      if (progress < 1) animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [percentage]);

  // SVG semicircle gauge
  const r = 70;
  const cx = 100;
  const cy = 95;
  const strokeW = 12;
  // Arc from 180° to 0° (left to right)
  const circumference = Math.PI * r;           // half circle arc length
  const filled = (percentage / 100) * circumference;

  const describeArc = (startDeg: number, endDeg: number) => {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const x1 = cx + r * Math.cos(toRad(startDeg));
    const y1 = cy + r * Math.sin(toRad(startDeg));
    const x2 = cx + r * Math.cos(toRad(endDeg));
    const y2 = cy + r * Math.sin(toRad(endDeg));
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };

  return (
    <div className="flex flex-col items-center w-full">
      <svg viewBox="0 0 200 105" className="w-full max-w-[220px]" overflow="visible">
        {/* Background track */}
        <path
          d={describeArc(180, 0)}
          fill="none"
          stroke="#1e293b"
          strokeWidth={strokeW}
          strokeLinecap="round"
        />
        {/* Glow filter */}
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Filled arc — animated via strokeDashoffset */}
        <path
          d={describeArc(180, 0)}
          fill="none"
          stroke={color}
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - filled}
          filter="url(#glow)"
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.34, 1.56, 0.64, 1), stroke 0.4s ease" }}
        />
        {/* Percentage text */}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="26" fontWeight="900" fill={color} fontFamily="inherit">
          {displayed}%
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#64748b" fontFamily="inherit" letterSpacing="2">
          TOTAL AVERAGE
        </text>
      </svg>
    </div>
  );
}

// ─── Color helper ──────────────────────────────────────────────────────────────
const getAttendanceColor = (pct: number) => {
  if (pct >= 75) return "#22c55e";
  if (pct >= 45) return "#eab308";
  return "#f43f5e";
};

// ─── Main Component ────────────────────────────────────────────────────────────
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

  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    handleResize(); // set initial
    window.addEventListener('resize', handleResize);
    
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => {
      clearInterval(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    if (userData) fetchTodayData();
  }, [userData]);

  const fetchTodayData = async () => {
    setLoading(true);
    try {
      let q;
      let branch = userData?.branch;
      let semester = userData?.semester;

      if (userData?.role === 'student' && (!branch || !semester)) {
        const prefix = userData.regNo?.substring(0, 8);
        if (prefix) {
          const mSnap = await getDocs(query(collection(db, "batchMappings"), where("prefix", "==", prefix)));
          if (!mSnap.empty) {
            const mapping = mSnap.docs[0].data();
            branch = mapping.branch;
            semester = mapping.semester;
          }
        }
      }

      if (userData?.role === 'teacher') {
        q = query(collection(db, "timetables"), where("day", "==", currentDay), where("teacher", "==", userData.name));
      } else if (userData?.role === 'student' && branch && semester) {
        q = query(collection(db, "timetables"), where("day", "==", currentDay), where("branch", "==", branch), where("semester", "==", semester));
      } else {
        setLoading(false);
        return;
      }

      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const sorted = data.sort((a: any, b: any) => a.startTime.localeCompare(b.startTime));
      setTodaySchedule(sorted);

      let totalUsersCount = 0;
      try {
        const usersSnap = await getCountFromServer(collection(db, "users"));
        totalUsersCount = usersSnap.data().count;
      } catch (e) { console.error(e); }

      setStats([
        { name: "Today's Classes", value: sorted.length.toString(), icon: Clock, color: "text-indigo-400", bg: "bg-indigo-500/10", border: "border-indigo-500/20" },
        { name: "Total Users", value: totalUsersCount.toString(), icon: Users, color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
        { name: "System Status", value: "Online", icon: ShieldCheck, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
        { name: "Notifications", value: "0", icon: AlertCircle, color: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20" },
      ]);

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
      if (!targetBranch || !targetSem || !userData?.regNo) return;

      // 1. Get ALL official subjects from timetable (unique)
      const timetableSnap = await getDocs(query(
        collection(db, "timetables"),
        where("branch", "==", targetBranch),
        where("semester", "==", targetSem)
      ));
      const officialSubjects = Array.from(
        new Set(timetableSnap.docs.map(doc => doc.data().subject).filter(Boolean))
      ) as string[];

      if (officialSubjects.length === 0) return;

      const cleanBranch = targetBranch.replace(/[\s/]+/g, '_');
      const cleanSem = targetSem.replace(/[\s/]+/g, '_');

      // 2. Pre-initialize ALL subjects with 0 (even those with no class yet)
      const subjectStatsMap: Record<string, { name: string; total: number; present: number }> = {};
      officialSubjects.forEach(subject => {
        subjectStatsMap[subject] = { name: subject, total: 0, present: 0 };
      });

      // 3. Fetch SubjectAttendance dates in parallel
      const results = await Promise.all(officialSubjects.map(async (subject: string) => {
        const cleanSub = subject.replace(/[\s/]+/g, '_');
        const snap = await getDocs(collection(db, "SubjectAttendance", `${cleanBranch}_${cleanSem}_${cleanSub}`, "dates"));
        return { subject, snap };
      }));

      // 4. Fill in actual attendance data (subjects with no classes stay at 0)
      results.forEach(({ subject, snap }) => {
        snap.forEach(dateDoc => {
          const data = dateDoc.data();
          subjectStatsMap[subject].total += 1;
          if (data.attendance && data.attendance[userData.regNo] === 'present') {
            subjectStatsMap[subject].present += 1;
          }
        });
      });

      const subjectStatsArray = Object.values(subjectStatsMap).map((s) => ({
        ...s,
        percentage: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0
      }));

      let totalPresent = 0;
      let totalSessions = 0;
      Object.values(subjectStatsMap).forEach((s) => {
        totalPresent += s.present;
        totalSessions += s.total;
      });

      setStudentAnalytics({
        percentage: totalSessions > 0 ? Math.round((totalPresent / totalSessions) * 100) : 0,
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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="max-w-7xl mx-auto space-y-5 pb-12"
    >

      {/* ── Row 1: Gauge (left) + Analytics (right) ── */}
      {userData?.role === 'student' && (
        <div className="overflow-x-auto pb-1 -mx-1 px-1">
          <div className="flex gap-5 min-w-[640px]">

            {/* Gauge Card */}
            <div className="w-[300px] shrink-0">
              <div className="bg-slate-900/80 backdrop-blur-sm rounded-2xl border border-slate-800 shadow-xl h-full flex flex-col">
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-800/60">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={14} className="text-emerald-400" />
                    <h4 className="text-xs font-bold text-white uppercase tracking-[0.15em]">Attendance Health</h4>
                  </div>
                  {studentAnalytics && (
                    <span
                      className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border"
                      style={{
                        color: getAttendanceColor(studentAnalytics.percentage),
                        borderColor: getAttendanceColor(studentAnalytics.percentage) + "40",
                        backgroundColor: getAttendanceColor(studentAnalytics.percentage) + "15",
                      }}
                    >
                      {studentAnalytics.percentage >= 75 ? "Good" : studentAnalytics.percentage >= 45 ? "Average" : "At Risk"}
                    </span>
                  )}
                </div>
                <div className="flex-1 flex flex-col items-center justify-center px-4 py-4">
                  <GaugeChart percentage={studentAnalytics?.percentage || 0} />
                  <div className="grid grid-cols-3 w-full gap-2 mt-3">
                    <div className="text-center p-2.5 bg-slate-950/80 rounded-xl border border-slate-800">
                      <p className="text-lg font-black text-white">{studentAnalytics?.totalPresent || 0}</p>
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Present</p>
                    </div>
                    <div className="text-center p-2.5 bg-slate-950/80 rounded-xl border border-slate-800">
                      <p className="text-lg font-black text-white">
                        {(studentAnalytics?.totalSessions || 0) - (studentAnalytics?.totalPresent || 0)}
                      </p>
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Absent</p>
                    </div>
                    <div className="text-center p-2.5 bg-slate-950/80 rounded-xl border border-slate-800">
                      <p className="text-lg font-black text-white">{studentAnalytics?.totalSessions || 0}</p>
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Total</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Analytics Bar Chart */}
            {studentAnalytics && (
              <div className="flex-1 min-w-[320px]">
                <div className="bg-slate-900/80 backdrop-blur-sm rounded-2xl border border-slate-800 shadow-xl h-full flex flex-col p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-indigo-600/15 rounded-xl border border-indigo-500/20">
                        <TrendingUp className="text-indigo-400" size={15} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white tracking-wide">Subject Analytics</h4>
                        <p className="text-[10px] text-slate-500 font-medium">{studentAnalytics.subjectStats.length} subjects</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 min-h-[200px]">
                    <ResponsiveContainer width="100%" height="100%" className="focus:outline-none" style={{ outline: 'none' }}>
                      <BarChart
                        data={studentAnalytics.subjectStats}
                        barCategoryGap={isDesktop ? "20%" : "30%"}
                        margin={{ top: 4, right: 8, left: -16, bottom: isDesktop ? 0 : 4 }}
                        style={{ outline: 'none' }}
                      >
                        {isDesktop ? (
                          <XAxis 
                            dataKey="name" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} 
                            height={24}
                          />
                        ) : (
                          <XAxis hide />
                        )}
                        <YAxis
                          fontSize={10}
                          tickLine={false}
                          axisLine={{ stroke: 'transparent' }}
                          tick={{ fill: '#64748b', fontWeight: 600 }}
                          domain={[0, 100]}
                          ticks={[0, 25, 50, 75, 100]}
                        />
                        <RechartsTooltip
                          cursor={{ fill: 'rgba(255,255,255,0.02)', radius: 6 }}
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const d = payload[0].payload;
                              const color = getAttendanceColor(d.percentage);
                              return (
                                <div className="bg-slate-950 border border-slate-800 px-3 py-2.5 rounded-xl shadow-2xl">
                                  <p className="text-[10px] font-black text-white uppercase tracking-wider mb-1">{d.name}</p>
                                  <p className="text-2xl font-black leading-none" style={{ color }}>{d.percentage}%</p>
                                  <p className="text-[9px] font-semibold text-slate-500 mt-1">
                                    {d.total === 0 ? "No classes held yet" : `${d.present} present / ${d.total} total`}
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar 
                          dataKey="percentage" 
                          radius={[5, 5, 0, 0]} 
                          barSize={isDesktop ? 40 : 32} 
                          isAnimationActive={false}
                          activeBar={false}
                          minPointSize={isDesktop ? 4 : 8}
                          style={{ outline: 'none' }}
                        >
                          {!isDesktop && (
                            <LabelList
                              dataKey="name"
                              content={(props: any) => {
                                const { x, y, width, height, value } = props;
                                const text = String(value);
                                const cx = x + width / 2;
                                const bottomY = (y + height) - 8;
                                return (
                                  <text
                                    x={cx}
                                    y={bottomY}
                                    fill="rgba(255,255,255,0.9)"
                                    fontSize={10}
                                    fontWeight={800}
                                    letterSpacing={0.5}
                                    textAnchor="start"
                                    dominantBaseline="middle"
                                    transform={`rotate(-90 ${cx} ${bottomY})`}
                                    style={{ pointerEvents: 'none', outline: 'none' }}
                                  >
                                    {text}
                                  </text>
                                );
                              }}
                            />
                          )}
                          {studentAnalytics.subjectStats.map((entry: any, index: number) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.total === 0 ? "#334155" : getAttendanceColor(entry.percentage)}
                              fillOpacity={entry.total === 0 ? 0.5 : 0.9}
                              style={{ outline: 'none' }}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Footer Legends */}
                  <div className="flex items-center justify-between mt-3 px-1">
                    <div className="flex items-center gap-2.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500/80 inline-block" />≥75%</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-yellow-500/80 inline-block" />45–74%</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-rose-500/80 inline-block" />&lt;45%</span>
                    </div>
                    {studentAnalytics.subjectStats.some(s => s.total === 0) && (
                      <p className="text-[9px] text-slate-500 font-medium text-right uppercase tracking-widest">
                        <span className="inline-block w-1.5 h-1.5 rounded bg-slate-700 mr-1 align-middle" />
                        No classes yet
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Row 2: Today's Timetable ── */}
      <div className="bg-slate-900/80 backdrop-blur-sm rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/15 rounded-xl border border-blue-500/20">
              <Calendar className="text-blue-400" size={18} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white tracking-wide">Today's Classes</h4>
              <p className="text-[10px] text-slate-500 font-medium">{currentDay}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-lg font-bold text-white tabular-nums">
                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
              </span>
              <p className="text-[9px] font-semibold text-emerald-400 uppercase tracking-widest">Live</p>
            </div>
            <div className="px-2.5 py-1 bg-slate-800 rounded-lg border border-slate-700">
              <span className="text-[10px] font-bold text-slate-400">{todaySchedule.length} slots</span>
            </div>
          </div>
        </div>

        {/* Slots Grid */}
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {todaySchedule.length > 0 ? todaySchedule.map((session) => {
            const isActive = session === currentSession;
            return (
              <div
                key={session.id}
                className={`relative p-4 rounded-xl border transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-600/10 border-blue-500/40 shadow-lg shadow-blue-500/5'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/30'
                }`}
              >
                {isActive && (
                  <span className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 rounded-full text-[8px] font-bold text-blue-400 uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                    Live
                  </span>
                )}
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock size={11} className={isActive ? 'text-blue-400' : 'text-slate-600'} />
                  <span className={`text-[10px] font-bold tracking-wider ${isActive ? 'text-blue-400' : 'text-slate-500'}`}>
                    {session.startTime} – {session.endTime}
                  </span>
                </div>
                <h5 className="text-sm font-black text-white uppercase tracking-tight mb-3 leading-tight">
                  {session.subject}
                </h5>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[9px] text-slate-500 font-semibold uppercase">
                    <DoorOpen size={10} className="text-slate-600" />
                    Room {session.room}
                  </span>
                  <span className="text-[9px] text-slate-600 font-bold uppercase">
                    {session.teacher?.split(' ')[0]}
                  </span>
                </div>
              </div>
            );
          }) : (
            <div className="col-span-full flex flex-col items-center justify-center py-16 text-slate-700">
              <Calendar size={36} className="mb-3 opacity-20" />
              <p className="text-xs font-black uppercase tracking-widest">No Classes Today</p>
              <p className="text-[10px] font-medium mt-1 opacity-40">Enjoy your free day</p>
            </div>
          )}
        </div>
      </div>

      {/* Teacher Stats */}
      {userData?.role === 'teacher' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, idx) => (
            <div key={idx} className={`p-5 rounded-2xl border ${stat.bg} ${stat.border} transition-all hover:scale-[1.02]`}>
              <div className="flex items-center justify-between mb-3">
                <stat.icon className={stat.color} size={18} />
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{stat.name}</span>
              </div>
              <p className="text-3xl font-black text-white">{stat.value}</p>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
