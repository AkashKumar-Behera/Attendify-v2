"use client";

import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc, deleteDoc, updateDoc, query, collection, where, getDocs, serverTimestamp, Timestamp } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { Monitor, ShieldCheck, Clock, Box, LayoutGrid, CheckCircle, AlertCircle, XCircle, Save, RefreshCw, Trophy } from "lucide-react";

export default function SmartboardPage() {
  const router = useRouter();
  const currentDayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date().getDay()];
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "waiting" | "authenticated" | "marking-attendance">("idle");
  const [activeTeacher, setActiveTeacher] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isMounted, setIsMounted] = useState(false);
  const [attendanceCount, setAttendanceCount] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  // New States for Leaderboard & Saving
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardStats, setLeaderboardStats] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Configuration States
  const [branches, setBranches] = useState<string[]>([]);
  const [semesters, setSemesters] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  
  const [selectedBranch, setSelectedBranch] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("");
  const [selectedTimeSlot, setSelectedTimeSlot] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [teacherSlots, setTeacherSlots] = useState<any[]>([]);

  const [students, setStudents] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<any[]>([]);

  const [attendanceData, setAttendanceData] = useState<Record<string, { status: string }>>({});
  
  const [timeLeft, setTimeLeft] = useState(120); // 2 minutes
  const [qrNonce, setQrNonce] = useState(0);
  const [filterStatus, setFilterStatus] = useState<"all" | "present" | "proxy" | "absent" | "pending">("all");

  useEffect(() => {
    setIsMounted(true);
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    
    const checkMobile = () => {
      // Using UserAgent check for mobile phones ONLY. Smartboards might run Android
      // but usually don't have Mobi. We explicitly do NOT check screen width.
      const isMobileDevice = /Mobi|iPhone|iPod/i.test(navigator.userAgent);
      setIsMobile(isMobileDevice);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      clearInterval(timer);
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  // Fetch initial configs
  useEffect(() => {
    const fetchConfigs = async () => {
      const bSnap = await getDocs(collection(db, "branches"));
      const sSnap = await getDocs(collection(db, "semesters"));
      const subSnap = await getDocs(collection(db, "subjects"));
      const mapSnap = await getDocs(collection(db, "batchMappings"));
      const userSnap = await getDocs(query(collection(db, "users"), where("role", "==", "student")));

      setBranches(bSnap.docs.map(doc => doc.data().name).sort());
      setSemesters(sSnap.docs.map(doc => doc.data().name).sort());
      setSubjects(subSnap.docs.map(doc => doc.data()));
      setMappings(mapSnap.docs.map(doc => doc.data()));
      setStudents(userSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };
    fetchConfigs();
  }, []);

  // Initialize Session
  useEffect(() => {
    const id = "SB-" + Math.random().toString(36).substr(2, 6).toUpperCase();
    setSessionId(id);
    setStatus("waiting");

    const sessionRef = doc(db, "smartboardSessions", id);
    setDoc(sessionRef, {
      boardId: id,
      status: "waiting",
      createdAt: new Date(),
    });

    const unsubscribe = onSnapshot(sessionRef, async (snapshot) => {
      const data = snapshot.data();
      if (data?.status === "authenticated" && data.teacherId) {
        setStatus("authenticated");
        setActiveTeacher(data.teacherName || "Professor");
        
        // Auto-detect current class
        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const currentDay = days[new Date().getDay()];
        
        const q = query(
          collection(db, "timetables"),
          where("teacher", "==", data.teacherName || "Professor")
        );
        const ttSnap = await getDocs(q);
        const allSlots = ttSnap.docs.map(doc => doc.data());
        setTeacherSlots(allSlots);
        
        const todaySlots = allSlots.filter(s => s.day === currentDay);
        const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
        
        let activeSlot = null;
        for (const slot of todaySlots) {
          const [startH, startM] = slot.startTime.split(':').map(Number);
          const [endH, endM] = slot.endTime.split(':').map(Number);
          const startMin = startH * 60 + startM;
          const endMin = endH * 60 + endM;
          if (nowMinutes >= startMin && nowMinutes <= endMin) {
            activeSlot = slot;
            break;
          }
        }
        
        if (!activeSlot && todaySlots.length > 0) activeSlot = todaySlots[0]; // fallback
        
        if (activeSlot) {
          setSelectedBranch(activeSlot.branch || "");
          setSelectedSemester(activeSlot.semester || "");
          setSelectedSubject(activeSlot.subject || "");
          setSelectedRoom(activeSlot.room || "");
          setSelectedTimeSlot(activeSlot.startTime && activeSlot.endTime ? `${activeSlot.startTime}-${activeSlot.endTime}` : "");
          setSelectedSection(activeSlot.section || "");
          setSelectedGroup(activeSlot.group || "");
        }
        
      } else if (data?.status === "marking-attendance") {
        setStatus("marking-attendance");
      }
    });

    return () => {
      unsubscribe();
      deleteDoc(sessionRef).catch(() => {});
    };
  }, []);

  // Filter students when branch/sem changes
  useEffect(() => {
    if (!selectedBranch || !selectedSemester) {
      setFilteredStudents([]);
      return;
    }
    
    const resolveStudentMeta = (u: any) => {
      if (!u.regNo) return { branch: "N/A", semester: "N/A", section: null, group: null };
      const prefix = u.regNo.substring(0, 8);
      const mapping = mappings.find(m => m.prefix === prefix);
      
      let sectionMatch = null;
      let groupMatch = null;
      
      if (mapping && mapping.sections) {
         const numericSuffix = parseInt(u.regNo.substring(8), 10);
         if (!isNaN(numericSuffix)) {
            for (const sec of mapping.sections) {
               if (numericSuffix >= sec.startRoll && numericSuffix <= sec.endRoll) {
                  sectionMatch = sec.name;
                  if (sec.groups) {
                     for (const grp of sec.groups) {
                        if (numericSuffix >= grp.startRoll && numericSuffix <= grp.endRoll) {
                           groupMatch = grp.name;
                           break;
                        }
                     }
                  }
                  break;
               }
            }
         }
      }

      return mapping ? { branch: mapping.branch, semester: mapping.semester, section: sectionMatch, group: groupMatch } : { branch: "Unmapped", semester: "Unmapped", section: null, group: null };
    };

    const filtered = students.filter(s => {
      const meta = resolveStudentMeta(s);
      let matches = meta.branch === selectedBranch && meta.semester === selectedSemester;
      if (matches && selectedSection) {
         matches = meta.section === selectedSection;
         if (matches && selectedGroup) {
            matches = meta.group === selectedGroup;
         }
      }
      return matches;
    });
    
    // Sort by name
    filtered.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    setFilteredStudents(filtered);
  }, [selectedBranch, selectedSemester, selectedSection, selectedGroup, students, mappings]);

  // Listen for attendance updates
  useEffect(() => {
    if (status === "marking-attendance" && sessionId) {
      const q = query(collection(db, "attendance"), where("sessionId", "==", sessionId));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const attData: Record<string, { status: string }> = {};
        let count = 0;
        snapshot.docs.forEach(doc => {
          const d = doc.data();
          attData[d.studentId] = { status: d.status || 'present' };
          if (d.status === 'present' || d.status === 'proxy') count++;
        });
        setAttendanceData(attData);
        setAttendanceCount(count);
      });
      return () => unsubscribe();
    }
  }, [status, sessionId]);

  // QR Code Refresh & Timer
  useEffect(() => {
    if (status === "marking-attendance") {
      const qrInterval = setInterval(async () => {
        const nextNonce = Math.floor(Math.random() * 1000000);
        setQrNonce(nextNonce);
        // Sync nonce to Firestore for security validation
        if (sessionId) {
          const sessionRef = doc(db, "smartboardSessions", sessionId);
          updateDoc(sessionRef, { currentNonce: nextNonce }).catch(e => console.error("Nonce sync failed", e));
        }
      }, 5000);
      
      const timerInterval = setInterval(async () => {
        setTimeLeft(prev => {
          if (prev <= 1) {
             clearInterval(timerInterval);
             clearInterval(qrInterval);
             // Lock session in Firestore
             if (sessionId) {
                const sessionRef = doc(db, "smartboardSessions", sessionId);
                updateDoc(sessionRef, { status: "locked" }).catch(e => console.error("Lock failed", e));
             }
             return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        clearInterval(qrInterval);
        clearInterval(timerInterval);
      };
    }
  }, [status]);

  // Auto-mark absent when timer ends
  useEffect(() => {
    if (status === "marking-attendance" && timeLeft === 0) {
      // Create absent records for students who haven't marked
      filteredStudents.forEach(student => {
        if (!attendanceData[student.id]) {
          const docRef = doc(db, "attendance", `${sessionId}_${student.id}`);
          setDoc(docRef, {
            sessionId,
            studentId: student.id,
            studentName: student.name,
            regNo: student.regNo,
            status: 'absent',
            timestamp: new Date()
          }, { merge: true });
        }
      });
    }
  }, [timeLeft, status]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getStudentStatusColor = (status: string | undefined) => {
    if (status === 'present') return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-100';
    if (status === 'proxy') return 'bg-amber-500/10 border-amber-500/30 text-amber-100';
    if (status === 'absent') return 'bg-rose-500/10 border-rose-500/30 text-rose-100';
    return 'bg-slate-800/30 border-white/5 text-slate-300';
  };

  const handleSaveAttendance = async () => {
    if (!sessionId) return;
    setIsSaving(true);
    try {
      const sessionRef = doc(db, "smartboardSessions", sessionId);
      await updateDoc(sessionRef, {
        status: 'completed',
        finalizedAt: serverTimestamp(),
        presentCount: Object.values(attendanceData).filter(a => a.status === 'present').length,
        proxyCount: Object.values(attendanceData).filter(a => a.status === 'proxy').length,
        absentCount: filteredStudents.length - Object.values(attendanceData).length,
      });

      // Save structured data for Leaderboard
      const dateStr = new Date().toLocaleDateString("en-IN").replace(/\//g, "-");
      const cleanBranch = selectedBranch.replace(/\s+/g, '_');
      const cleanSem = selectedSemester.replace(/\s+/g, '_');
      const cleanSub = selectedSubject.replace(/\s+/g, '_');
      
      const leaderboardDocRef = doc(db, "SubjectAttendance", `${cleanBranch}_${cleanSem}_${cleanSub}`);
      await setDoc(leaderboardDocRef, { subject: selectedSubject, branch: selectedBranch, semester: selectedSemester }, { merge: true });
      
      const safeTimeSlot = selectedTimeSlot.replace(/[^a-zA-Z0-9]/g, '');
      const docId = safeTimeSlot ? `${dateStr}_${safeTimeSlot}` : dateStr;
      const dateDocRef = doc(collection(leaderboardDocRef, "dates"), docId);
      
      // Build attendance map by regNo
      const finalAttendanceMap: Record<string, string> = {};
      filteredStudents.forEach(student => {
         if (!student.regNo) return;
         // Status might be from attendanceData, or default to absent
         const st = attendanceData[student.id]?.status || 'absent';
         finalAttendanceMap[student.regNo] = st;
      });

      await setDoc(dateDocRef, {
         teacherName: activeTeacher || "Professor",
         date: dateStr,
         timeslot: selectedTimeSlot || "",
         attendance: finalAttendanceMap,
         timestamp: serverTimestamp()
      }, { merge: true });

      alert("Attendance records finalized and saved to database!");
    } catch (err) {
      console.error("Save error:", err);
      alert("Failed to save records.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestartAttendance = async () => {
    if (confirm("Reset and start attendance again? This will wipe the current session data.")) {
      if (sessionId) {
        // Delete current session
        await deleteDoc(doc(db, "smartboardSessions", sessionId));
        // Delete any attendance marked in this session
        const attQuery = query(collection(db, "attendance"), where("sessionId", "==", sessionId));
        const snap = await getDocs(attQuery);
        
        // Wait for all deletions to finish
        await Promise.all(snap.docs.map(d => deleteDoc(doc(db, "attendance", d.id))));
      }
      
      // True state reset
      window.location.reload();
    }
  };

  const toggleLeaderboard = async () => {
    if (!showLeaderboard) {
      try {
        const cleanBranch = selectedBranch.replace(/\s+/g, '_');
        const cleanSem = selectedSemester.replace(/\s+/g, '_');
        const cleanSub = selectedSubject.replace(/\s+/g, '_');
        
        const datesColRef = collection(db, "SubjectAttendance", `${cleanBranch}_${cleanSem}_${cleanSub}`, "dates");
        const datesSnap = await getDocs(datesColRef);
        
        const totalSessions = datesSnap.size;
        if (totalSessions > 0) {
           const stats: any = {};
           
           // Pre-fill stats for all filtered students to ensure they show up even if 0 present
           filteredStudents.forEach(student => {
              if (student.regNo) {
                 stats[student.regNo] = { present: 0, total: totalSessions, name: student.name, id: student.id };
              }
           });

           datesSnap.docs.forEach(doc => {
              const data = doc.data();
              if (data.attendance) {
                 Object.entries(data.attendance).forEach(([regNo, status]) => {
                    if (stats[regNo]) {
                       if (status === 'present') {
                          stats[regNo].present += 1;
                       }
                    }
                 });
              }
           });
           
           // Calculate percentages
           const finalStats: any = {};
           Object.keys(stats).forEach(regNo => {
              const s = stats[regNo];
              const percentage = s.total > 0 ? Math.round((s.present / s.total) * 100) : 0;
              finalStats[regNo] = { ...s, percentage };
           });
           
           setLeaderboardStats(finalStats);
        } else {
           setLeaderboardStats(null);
        }
      } catch (err) {
        console.error("Leaderboard fetch error:", err);
      }
    }
    setShowLeaderboard(!showLeaderboard);
  };

  const handleStartAttendance = async () => {
    if (sessionId) {
      const sessionRef = doc(db, "smartboardSessions", sessionId);
      await updateDoc(sessionRef, {
        status: "marking-attendance",
        attendanceStartedAt: new Date(),
        metadata: {
           branch: selectedBranch,
           semester: selectedSemester,
           subject: selectedSubject,
           room: selectedRoom,
           timeSlot: selectedTimeSlot,
           teacherName: activeTeacher,
           section: selectedSection,
           group: selectedGroup
        }
      });
    }
  };

  const handleManualOverride = async (studentId: string, currentStatus: string) => {
    if (timeLeft > 0) return; // Only allow after timer ends
    
    let newStatus = 'present';
    if (currentStatus === 'present') newStatus = 'absent';
    else if (currentStatus === 'proxy') newStatus = 'present';
    else if (currentStatus === 'absent') newStatus = 'present';

    const student = filteredStudents.find(s => s.id === studentId);
    if (!student) return;

    const docRef = doc(db, "attendance", `${sessionId}_${studentId}`);
    await setDoc(docRef, {
      sessionId,
      studentId: student.id,
      studentName: student.name,
      regNo: student.regNo,
      status: newStatus,
      timestamp: new Date()
    }, { merge: true });
  };



  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 overflow-x-hidden selection:bg-blue-500/30">
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-600/5 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-indigo-600/5 rounded-full blur-[120px]"></div>
      </div>

      {/* Header Area */}
      <header className="fixed top-0 inset-x-0 h-16 sm:h-20 flex items-center justify-between px-4 sm:px-10 glass-header z-50 overflow-hidden">
        <div className="flex items-center gap-3 sm:gap-4 relative z-10">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/40 border border-blue-400/20">
            <Monitor size={18} className="text-white sm:hidden" />
            <Monitor size={22} className="text-white hidden sm:block" />
          </div>
          <div>
            <h1 className="text-sm sm:text-lg font-black text-white tracking-tighter italic uppercase">Attendify <span className="text-blue-500 not-italic">SB</span></h1>
            <p className="text-[7px] sm:text-[9px] text-slate-500 font-black tracking-[0.2em] uppercase">Classroom Interface</p>
          </div>
        </div>

        {/* Right Info */}
        <div className="flex items-center gap-3 sm:gap-6 relative z-10">
          <div className="text-right hidden md:block">
             <p className="text-xs sm:text-sm font-black text-white font-mono">
               {isMounted ? currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "--:--:--"}
             </p>
             <p className="text-[7px] sm:text-[9px] text-slate-500 font-black uppercase tracking-widest">
               {isMounted ? currentTime.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) : "Loading..."}
             </p>
          </div>
          <div className="h-8 sm:h-10 w-[1px] bg-slate-800 hidden sm:block"></div>
          <div className="bg-slate-900/50 border border-slate-800 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg flex items-center gap-2 sm:gap-3">
             <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-blue-500 animate-pulse"></div>
             <span className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">{sessionId || "---"}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 w-full flex-1 flex flex-col items-center justify-center mt-16 sm:mt-20 mb-4">
        {status === "waiting" && (
          <div className="flex flex-col lg:flex-row items-center justify-center gap-8 sm:gap-12 lg:gap-16 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            {/* QR Section */}
            <div className="relative group w-full max-w-[320px] sm:max-w-none flex justify-center">
               <div className="absolute -inset-4 bg-blue-600/20 rounded-xl blur-2xl group-hover:bg-blue-600/30 transition-all"></div>
               <div className="relative bg-white p-4 sm:p-6 md:p-8 rounded-lg shadow-2xl transition-transform duration-500 w-full max-w-[280px] sm:max-w-[320px] md:max-w-[380px]">
                  <div className="aspect-square w-full">
                    <QRCode value={`LOGIN_SB:${sessionId}`} style={{ height: "auto", maxWidth: "100%", width: "100%" }} level="H" />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                     <div className="w-10 h-10 sm:w-16 sm:h-16 bg-white rounded-lg p-1.5 sm:p-2 shadow-xl border border-slate-100">
                        <Box className="w-full h-full text-blue-600" />
                     </div>
                  </div>
               </div>
            </div>

            {/* Info Section */}
            <div className="text-center lg:text-left space-y-6 sm:space-y-8 max-w-md px-4">
              <div className="space-y-3 sm:space-y-4">
                 <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white leading-none tracking-tight">Teacher Login <br /><span className="text-blue-500 italic">Required</span></h2>
                 <p className="text-slate-400 font-medium text-xs sm:text-sm leading-relaxed">
                   Please open the <span className="text-white font-bold italic underline decoration-blue-500/50 underline-offset-4">Attendify App</span> and scan this QR to start the session.
                 </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 sm:gap-4">
                 <div className="flex items-center gap-3 sm:gap-4 bg-slate-900/40 p-4 sm:p-5 rounded-lg border border-slate-800/50">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-600/10 flex items-center justify-center text-blue-500">
                       <ShieldCheck size={18} />
                    </div>
                    <div className="text-left">
                       <p className="text-[8px] sm:text-[10px] font-black text-white uppercase tracking-widest">End-to-End Secure</p>
                       <p className="text-[7px] sm:text-[9px] text-slate-500 font-bold uppercase tracking-tighter">Session encryption active</p>
                    </div>
                 </div>
                 <div className="flex items-center gap-3 sm:gap-4 bg-slate-900/40 p-4 sm:p-5 rounded-lg border border-slate-800/50">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-indigo-600/10 flex items-center justify-center text-indigo-500">
                       <LayoutGrid size={18} />
                    </div>
                    <div className="text-left">
                       <p className="text-[8px] sm:text-[10px] font-black text-white uppercase tracking-widest">Auto Timetable</p>
                       <p className="text-[7px] sm:text-[9px] text-slate-500 font-bold uppercase tracking-tighter">Auto class detection</p>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        )}

        {status === "authenticated" && (
          <div className="flex flex-col items-center text-center animate-in zoom-in fade-in duration-700 w-full max-w-4xl px-4">
             <div className="w-20 h-20 bg-emerald-500/10 rounded-lg border-2 border-emerald-500/20 flex items-center justify-center mb-6 shadow-[0_0_60px_rgba(16,185,129,0.1)]">
                <ShieldCheck size={40} className="text-emerald-500" />
             </div>
             <h2 className="text-3xl font-black text-white tracking-tighter uppercase mb-2">Authenticated</h2>
             <p className="text-lg text-slate-400 font-medium mb-10">Welcome back, <span className="text-emerald-400 font-black">{activeTeacher}</span></p>

             <div className="w-full card-premium p-6 sm:p-8 text-left grid grid-cols-1 md:grid-cols-2 gap-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                   <LayoutGrid size={120} />
                </div>
                <div className="space-y-4 relative z-10">
                   <h3 className="text-sm font-black text-white uppercase tracking-widest border-b border-white/10 pb-2 mb-4">Class Configuration</h3>
                   
                   <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400">Branch</label>
                      <select value={selectedBranch} onChange={e => { setSelectedBranch(e.target.value); setSelectedSection(""); setSelectedGroup(""); }} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-all">
                         <option value="">Select Branch</option>
                         {teacherSlots.length > 0 
                           ? Array.from(new Set(teacherSlots.map(s => s.branch))).sort().map(b => <option key={b} value={b}>{b}</option>)
                           : branches.map(b => <option key={b} value={b}>{b}</option>)
                         }
                      </select>
                   </div>
                   
                   <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400">Semester</label>
                      <select value={selectedSemester} onChange={e => { setSelectedSemester(e.target.value); setSelectedSection(""); setSelectedGroup(""); }} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all">
                         <option value="">Select Semester</option>
                         {teacherSlots.length > 0 
                           ? Array.from(new Set(teacherSlots.filter(s => !selectedBranch || s.branch === selectedBranch).map(s => s.semester))).sort().map(s => <option key={s} value={s}>{s}</option>)
                           : semesters.map(s => <option key={s} value={s}>{s}</option>)
                         }
                      </select>
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                         <label className="text-xs font-semibold text-slate-400">Section</label>
                         <select value={selectedSection} onChange={e => { setSelectedSection(e.target.value); setSelectedGroup(""); }} disabled={!selectedBranch || !selectedSemester} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-all disabled:opacity-50">
                            <option value="">All Sections</option>
                            {mappings.find(m => m.branch === selectedBranch && m.semester === selectedSemester)?.sections?.map((sec: any) => (
                               <option key={sec.name} value={sec.name}>{sec.name}</option>
                            ))}
                         </select>
                      </div>

                      <div className="space-y-1.5">
                         <label className="text-xs font-semibold text-slate-400">Group</label>
                         <select value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)} disabled={!selectedSection} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 transition-all disabled:opacity-50">
                            <option value="">All Groups</option>
                            {mappings.find(m => m.branch === selectedBranch && m.semester === selectedSemester)?.sections?.find((s: any) => s.name === selectedSection)?.groups?.map((grp: any) => (
                               <option key={grp.name} value={grp.name}>{grp.name}</option>
                            ))}
                         </select>
                      </div>
                   </div>
                </div>

                <div className="space-y-4 relative z-10">
                   <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest border-b border-transparent pb-2 mb-4">&nbsp;</h3>
                   
                   <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400">Subject</label>
                      <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-all">
                         <option value="">Select Subject</option>
                         {teacherSlots.length > 0
                           ? Array.from(new Set(teacherSlots.filter(s => (!selectedBranch || s.branch === selectedBranch) && (!selectedSemester || s.semester === selectedSemester)).map(s => s.subject))).sort().map(sub => (
                              <option key={sub} value={sub}>{sub}</option>
                           ))
                           : subjects.filter(s => s.branch === selectedBranch).map(s => <option key={s.name} value={s.name}>{s.name}</option>)
                         }
                      </select>
                   </div>

                   <div className="space-y-1.5">
                       <label className="text-xs font-semibold text-slate-400">Room</label>
                       <select 
                          value={selectedRoom} 
                          onChange={e => setSelectedRoom(e.target.value)} 
                          className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500 transition-all uppercase"
                       >
                          <option value="">Select Room</option>
                          {Array.from(new Set(teacherSlots.filter(s => s.day === currentDayName).map(s => s.room))).filter(Boolean).map(room => (
                             <option key={room} value={room}>{room}</option>
                          ))}
                          {selectedRoom && !teacherSlots.some(s => s.room === selectedRoom) && (
                             <option value={selectedRoom}>{selectedRoom}</option>
                          )}
                       </select>
                    </div>

                    <div className="space-y-1.5">
                       <label className="text-xs font-semibold text-slate-400">Time Slot</label>
                       <select 
                          value={selectedTimeSlot} 
                          onChange={e => setSelectedTimeSlot(e.target.value)} 
                          className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500 transition-all uppercase"
                       >
                          <option value="">Select Time Slot</option>
                          {teacherSlots.filter(s => s.day === currentDayName).map((s, idx) => {
                             const slotStr = `${s.startTime}-${s.endTime}`;
                             return <option key={idx} value={slotStr}>{slotStr} ({s.subject})</option>
                          })}
                          {selectedTimeSlot && !teacherSlots.some(s => `${s.startTime}-${s.endTime}` === selectedTimeSlot) && (
                             <option value={selectedTimeSlot}>{selectedTimeSlot}</option>
                          )}
                       </select>
                    </div>
                </div>
             </div>

             <div className="w-full mt-6 flex justify-end">
                <button 
                  onClick={handleStartAttendance}
                  disabled={!selectedBranch || !selectedSemester || !selectedSubject || !selectedRoom || !selectedTimeSlot}
                  className="btn-3d-blue py-3 px-8 text-sm uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                >
                   Start Session
                </button>
             </div>
          </div>
        )}

        {status === "marking-attendance" && (
          <div className="flex flex-col lg:flex-row gap-4 w-full max-w-[1600px] animate-in fade-in duration-700 px-2 sm:px-6 h-[calc(100vh-140px)] overflow-hidden">
             {/* Left Area: Student Grid */}
             <div className="flex-1 card-premium p-4 sm:p-6 flex flex-col overflow-hidden relative">
                <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                   <LayoutGrid size={200} />
                </div>
                <div className="flex items-center justify-between mb-4 relative z-10">
                   <div>
                      <h3 className="text-lg sm:text-xl font-black text-white">{selectedSubject} <span className="text-sm text-slate-400 font-medium tracking-normal ml-2">by {activeTeacher}</span></h3>
                      <p className="text-[10px] text-slate-400 uppercase tracking-widest">
                         {selectedBranch} • {selectedSemester}
                         {selectedSection && ` • Sec: ${selectedSection}`}
                         {selectedGroup && ` • Grp: ${selectedGroup}`}
                         {' • '} {selectedRoom} • {selectedTimeSlot}
                      </p>
                   </div>
                   <div className="flex gap-4">
                      <div className="text-center">
                         <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Present</p>
                         <p className="text-xl sm:text-2xl font-black text-emerald-400">{attendanceCount}</p>
                      </div>
                      <div className="text-center">
                         <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Total</p>
                         <p className="text-xl sm:text-2xl font-black text-white">{filteredStudents.length}</p>
                      </div>
                   </div>
                </div>

                {/* Filter Info */}
                {filterStatus !== "all" && (
                   <div className="mb-4 flex items-center gap-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Filter:</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${
                         filterStatus === 'present' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' :
                         filterStatus === 'proxy' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50' :
                         'bg-rose-500/20 text-rose-400 border border-rose-500/50'
                      }`}>
                         {filterStatus}
                      </span>
                      <button onClick={() => setFilterStatus("all")} className="text-[10px] font-bold text-blue-500 hover:underline ml-2">Clear</button>
                   </div>
                )}

                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2 overflow-y-auto pr-2 custom-scrollbar flex-1 content-start relative z-10 pb-10">
                   {filteredStudents
                     .filter(s => {
                        if (filterStatus === "all") return true;
                        const st = attendanceData[s.id]?.status || (timeLeft === 0 ? 'absent' : 'pending');
                        return st === filterStatus;
                     })
                     .map((student, idx) => {
                       const st = attendanceData[student.id]?.status;
                       const isAbsent = timeLeft === 0 && !st;
                       const finalStatus = isAbsent ? 'absent' : st;
                       const colorClass = getStudentStatusColor(finalStatus);
                       
                       return (
                          <div 
                             key={student.id} 
                             onClick={() => handleManualOverride(student.id, finalStatus || 'pending')}
                             className={`p-2 sm:p-3 rounded-lg border ${colorClass} ${timeLeft === 0 ? 'cursor-pointer hover:scale-105 shadow-xl' : 'cursor-default'} transition-all flex flex-col justify-between aspect-[4/3] backdrop-blur-sm overflow-hidden`}
                          >
                             <p className="text-[10px] sm:text-xs font-bold truncate text-white leading-tight">{student.name}</p>
                             <div className="flex items-end justify-between mt-1">
                                <p className="text-[9px] sm:text-xs font-black opacity-60 font-mono">
                                  {student.regNo ? student.regNo.slice(-4) : String(idx+1).padStart(2, '0')}
                                </p>
                                {finalStatus === 'present' && <CheckCircle size={14} className="text-emerald-400" />}
                                {finalStatus === 'proxy' && <AlertCircle size={14} className="text-amber-400" />}
                                {finalStatus === 'absent' && <XCircle size={14} className="text-rose-500" />}
                             </div>
                          </div>
                        );
                    })}
                   
                   {filteredStudents.length === 0 && (
                      <div className="col-span-full h-40 flex items-center justify-center border border-dashed border-white/10 rounded-lg">
                         <p className="text-slate-500 text-sm font-medium">No students found for this branch and semester.</p>
                      </div>
                   )}
                </div>
             </div>

             {/* Right Area: QR, Timer & Stats */}
             <div className="w-full lg:w-[320px] flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-1 relative z-10">
                {/* QR Code & Timer Card */}
                <div className="card-premium p-4 flex flex-col items-center relative overflow-hidden flex-shrink-0">
                   <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                      <Clock size={100} />
                   </div>
                   
                   <div className="flex justify-between items-center w-full mb-4 relative z-10">
                      <h3 className="text-xs font-black text-white uppercase tracking-widest">Attendance QR</h3>
                      <div className="flex items-center gap-1.5 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                         <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                         <span className="text-[9px] font-black text-blue-400 uppercase tracking-tighter">Live</span>
                      </div>
                   </div>
                   
                   {/* QR Container - Responsive & Fixed Aspect */}
                   <div className="bg-white p-3 rounded-xl shadow-[0_0_50px_rgba(255,255,255,0.1)] w-full aspect-square max-w-[220px] mb-3 relative z-10 ring-1 ring-white/10 flex items-center justify-center overflow-hidden">
                      <div className={`w-full h-full flex items-center justify-center transition-all duration-500 ${timeLeft === 0 ? 'blur-md grayscale opacity-50 scale-95' : ''}`}>
                        <QRCode 
                          value={timeLeft > 0 ? `ATTENDANCE:${sessionId}:${qrNonce}` : `EXPIRED_SESSION:${sessionId}`}
                          style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                          level="M"
                        />
                      </div>
                      {timeLeft === 0 && (
                         <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none">
                            <div className="bg-rose-600/90 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg transform -rotate-12 border border-white/20">
                               EXPIRED
                            </div>
                         </div>
                      )}
                   </div>

                   {/* Timer Box - Reduced size as requested */}
                   <div className="w-fit mx-auto bg-amber-500/5 border border-amber-500/10 py-2 px-6 rounded-xl text-center relative z-10">
                      <p className="text-[8px] font-black text-amber-500/60 uppercase tracking-[0.2em] mb-1">Time Remaining</p>
                      <div className={`text-lg font-black font-mono tracking-widest ${timeLeft < 30 ? 'text-rose-500 animate-pulse' : 'text-amber-400'}`}>
                         {timeLeft > 0 ? formatTime(timeLeft) : "LOCKED"}
                      </div>
                   </div>
                </div>

                <div className="card-premium p-4 space-y-2">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 border-b border-white/5 pb-2">Control Panel</h3>
                    
                    <div className="grid grid-cols-2 gap-2">
                       <button 
                          onClick={handleSaveAttendance}
                          disabled={isSaving}
                          className="flex flex-col items-center justify-center gap-1 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all group"
                       >
                          <Save size={18} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                          <span className="text-[8px] font-black text-emerald-500 uppercase">Save</span>
                       </button>
                       
                       <button 
                          onClick={handleRestartAttendance}
                          className="flex flex-col items-center justify-center gap-1 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-all group"
                       >
                          <RefreshCw size={18} className="text-amber-400 group-hover:rotate-180 transition-transform duration-500" />
                          <span className="text-[8px] font-black text-amber-500 uppercase">Restart</span>
                       </button>

                       <button 
                          onClick={toggleLeaderboard}
                          className={`col-span-2 flex items-center justify-center gap-2 p-2 rounded-xl border transition-all ${showLeaderboard ? 'bg-indigo-600 border-indigo-400 shadow-[0_0_20px_rgba(79,70,229,0.4)]' : 'bg-slate-900/50 border-white/5 hover:bg-white/5'}`}
                       >
                          <Trophy size={14} className={showLeaderboard ? 'text-white' : 'text-indigo-400'} />
                          <span className={`text-[9px] font-black uppercase tracking-widest ${showLeaderboard ? 'text-white' : 'text-slate-400'}`}>
                             {showLeaderboard ? 'Hide Leaderboard' : 'Show Leaderboard'}
                          </span>
                       </button>
                    </div>
                </div>

                {/* Filter Controls */}
                <div className="card-premium p-4 space-y-2">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 border-b border-white/5 pb-2">Filter Board</h3>
                    
                    <button 
                       onClick={() => setFilterStatus("present")}
                       className={`w-full flex items-center justify-between p-2 rounded-lg transition-all border ${filterStatus === 'present' ? 'bg-emerald-500/20 border-emerald-500/50 ring-2 ring-emerald-500/20' : 'bg-slate-900/50 border-white/5 hover:bg-white/5'}`}
                    >
                       <div className="flex items-center gap-3">
                          <div className="w-2.5 h-2.5 rounded bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                          <p className="text-[10px] text-slate-300 font-black uppercase tracking-widest">Present</p>
                       </div>
                       <span className="text-[10px] font-black text-emerald-400">{Object.values(attendanceData).filter(a => a.status === 'present').length}</span>
                    </button>
                    
                    <button 
                       onClick={() => setFilterStatus("proxy")}
                       className={`w-full flex items-center justify-between p-2 rounded-lg transition-all border ${filterStatus === 'proxy' ? 'bg-amber-500/20 border-amber-500/50 ring-2 ring-amber-500/20' : 'bg-slate-900/50 border-white/5 hover:bg-white/5'}`}
                    >
                       <div className="flex items-center gap-3">
                          <div className="w-2.5 h-2.5 rounded bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]"></div>
                          <p className="text-[10px] text-slate-300 font-black uppercase tracking-widest">Proxy</p>
                       </div>
                       <span className="text-[10px] font-black text-amber-400">{Object.values(attendanceData).filter(a => a.status === 'proxy').length}</span>
                    </button>
                    
                    <button 
                       onClick={() => setFilterStatus("absent")}
                       className={`w-full flex items-center justify-between p-2 rounded-lg transition-all border ${filterStatus === 'absent' ? 'bg-rose-500/20 border-rose-500/50 ring-2 ring-rose-500/20' : 'bg-slate-900/50 border-white/5 hover:bg-white/5'}`}
                    >
                       <div className="flex items-center gap-3">
                          <div className="w-2.5 h-2.5 rounded bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]"></div>
                          <p className="text-[10px] text-slate-300 font-black uppercase tracking-widest">Absent</p>
                       </div>
                       <span className="text-[10px] font-black text-rose-400">{Object.values(attendanceData).filter(a => a.status === 'absent').length}</span>
                    </button>

                    <button 
                       onClick={() => setFilterStatus("all")}
                       className={`w-full flex items-center justify-between p-2 rounded-lg transition-all border ${filterStatus === 'all' ? 'bg-indigo-500/20 border-indigo-500/50 ring-2 ring-indigo-500/20' : 'bg-slate-900/50 border-white/5 hover:bg-white/5'}`}
                    >
                       <div className="flex items-center gap-3">
                          <div className="w-2.5 h-2.5 rounded bg-indigo-500"></div>
                          <p className="text-[10px] text-slate-300 font-black uppercase tracking-widest">All Students</p>
                       </div>
                       <span className="text-[10px] font-black text-slate-400">{filteredStudents.length}</span>
                    </button>
                    
                    <button 
                       onClick={() => setFilterStatus("pending")}
                       className={`w-full flex items-center justify-between p-2 rounded-lg transition-all border ${filterStatus === 'pending' ? 'bg-slate-500/20 border-slate-500/50 ring-2 ring-slate-500/20' : 'bg-slate-900/50 border-white/5 hover:bg-white/5'}`}
                    >
                       <div className="flex items-center gap-3">
                          <div className="w-2.5 h-2.5 rounded bg-slate-500"></div>
                          <p className="text-[10px] text-slate-300 font-black uppercase tracking-widest">Pending</p>
                       </div>
                       <span className="text-[10px] font-black text-slate-400">
                          {filteredStudents.filter(s => {
                             const st = attendanceData[s.id]?.status || (timeLeft === 0 ? 'absent' : 'pending');
                             return st === 'pending';
                          }).length}
                       </span>
                    </button>
                 </div>
             </div>
          </div>
        )}
      </main>

      {/* Leaderboard Overlay */}
      {showLeaderboard && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in zoom-in duration-300">
           <div className="w-full max-w-4xl bg-slate-900 rounded-3xl border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.5)] flex flex-col max-h-[80vh] overflow-hidden">
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-indigo-600/10">
                 <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-500/20 rounded-2xl border border-indigo-500/30">
                       <Trophy size={24} className="text-indigo-400" />
                    </div>
                    <div>
                       <h2 className="text-xl font-black text-white uppercase tracking-widest">Subject Leaderboard</h2>
                       <p className="text-xs text-indigo-400 font-bold uppercase">{selectedSubject} • Cumulative Performance</p>
                    </div>
                 </div>
                 <button onClick={() => setShowLeaderboard(false)} className="p-2 hover:bg-white/10 rounded-full transition-all">
                    <XCircle size={24} className="text-slate-400" />
                 </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {leaderboardStats && Object.values(leaderboardStats)
                      .sort((a: any, b: any) => b.percentage - a.percentage)
                      .map((stat: any, index: number) => (
                         <div key={stat.id} className="bg-slate-950/50 border border-white/5 p-4 rounded-2xl flex items-center gap-4 group hover:border-indigo-500/30 transition-all">
                            <div className="w-8 text-center">
                               <span className={`text-lg font-black ${index < 3 ? 'text-amber-400' : 'text-slate-600'}`}>#{index + 1}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                               <p className="text-sm font-black text-white truncate">{stat.name}</p>
                               <div className="flex items-center gap-2 mt-1">
                                  <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                     <div 
                                        className={`h-full rounded-full transition-all duration-1000 ${
                                           stat.percentage > 75 ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]' : 
                                           stat.percentage > 50 ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)]' : 
                                           'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.4)]'
                                        }`}
                                        style={{ width: `${stat.percentage}%` }}
                                     ></div>
                                  </div>
                                  <span className="text-[10px] font-black font-mono text-slate-400">{stat.percentage}%</span>
                                </div>
                               <p className="text-[9px] text-slate-500 font-bold uppercase mt-1">
                                  {stat.present} Present / {stat.total} Total
                               </p>
                            </div>
                         </div>
                      ))
                    }
                    {(!leaderboardStats || Object.keys(leaderboardStats).length === 0) && (
                       <div className="col-span-full py-20 text-center">
                          <p className="text-slate-500 font-bold uppercase tracking-widest">No historical data available for this subject.</p>
                       </div>
                    )}
                 </div>
              </div>
              
              <div className="p-4 bg-slate-950/50 border-t border-white/5 text-center">
                 <p className="text-[9px] text-slate-600 font-black uppercase tracking-[0.2em]">Data synchronized with Firestore Realtime</p>
              </div>
           </div>
        </div>
      )}

      {/* Mobile Restriction Overlay */}
      {isMobile && (
        <div className="fixed inset-0 z-[100] bg-[#020617] flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
           <div className="w-20 h-20 bg-rose-500/10 rounded-2xl border-2 border-rose-500/20 flex items-center justify-center mb-6 shadow-[0_0_60px_rgba(244,63,94,0.1)]">
              <Monitor size={40} className="text-rose-500" />
           </div>
           <h2 className="text-2xl font-black text-white tracking-tighter uppercase mb-4">Desktop Access Only</h2>
           <p className="text-slate-400 font-medium text-sm leading-relaxed max-w-xs">
              This Smartboard interface is optimized for large displays. <br />
              <span className="text-white font-bold italic">Small screens are not supported for this view.</span>
           </p>
           <div className="mt-10 p-4 border border-white/5 rounded-xl bg-white/5">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Device requirement</p>
              <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">Minimum Resolution: 1024px Width</p>
           </div>
        </div>
      )}

      {/* Footer Branding */}
      <footer className="fixed bottom-4 sm:bottom-6 text-center px-4 w-full pointer-events-none z-0">
         <p className="text-[7px] sm:text-[10px] font-black text-slate-700 uppercase tracking-[0.2em] sm:tracking-[0.4em]">Academic Ledger System v2.0</p>
      </footer>
      {/* Mobile Block Overlay */}
      {isMobile && (
         <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-xl animate-in fade-in duration-300">
            <div className="max-w-md w-full bg-slate-900 border border-rose-500/20 p-8 rounded-3xl text-center shadow-[0_0_50px_rgba(244,63,94,0.1)] relative overflow-hidden">
               <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                  <Monitor size={150} />
               </div>
               <div className="relative z-10">
                   <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6 border border-rose-500/20">
                      <Monitor size={32} />
                   </div>
                   <h2 className="text-xl font-black text-white uppercase tracking-widest mb-3">Desktop Required</h2>
                   <p className="text-xs text-slate-400 font-medium mb-8 leading-relaxed">
                      This website is not meant for mobile devices. The Smartboard interface is strictly designed for Desktop and Smartboard displays.
                   </p>
                   <button onClick={() => router.push('/dashboard')} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all">
                      Return to Dashboard
                   </button>
               </div>
            </div>
         </div>
      )}

    </div>
  );
}
