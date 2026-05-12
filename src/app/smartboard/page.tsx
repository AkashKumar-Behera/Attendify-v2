"use client";

import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc, deleteDoc, updateDoc, query, collection, where, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { Monitor, ShieldCheck, Clock, Box, LayoutGrid, CheckCircle, AlertCircle, XCircle } from "lucide-react";

export default function SmartboardPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "waiting" | "authenticated" | "marking-attendance">("idle");
  const [activeTeacher, setActiveTeacher] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isMounted, setIsMounted] = useState(false);
  const [attendanceCount, setAttendanceCount] = useState(0);

  // Configuration States
  const [branches, setBranches] = useState<string[]>([]);
  const [semesters, setSemesters] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  
  const [selectedBranch, setSelectedBranch] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("");

  const [students, setStudents] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<any[]>([]);

  const [attendanceData, setAttendanceData] = useState<Record<string, { status: string }>>({});
  
  const [timeLeft, setTimeLeft] = useState(120); // 2 minutes
  const [qrNonce, setQrNonce] = useState(0);
  const [filterStatus, setFilterStatus] = useState<"all" | "present" | "proxy" | "absent">("all");

  useEffect(() => {
    setIsMounted(true);
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
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
          where("teacher", "==", data.teacherName || "Professor"),
          where("day", "==", currentDay)
        );
        const ttSnap = await getDocs(q);
        const slots = ttSnap.docs.map(doc => doc.data());
        
        const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
        
        let activeSlot = null;
        for (const slot of slots) {
          const [startH, startM] = slot.startTime.split(':').map(Number);
          const [endH, endM] = slot.endTime.split(':').map(Number);
          const startMin = startH * 60 + startM;
          const endMin = endH * 60 + endM;
          if (nowMinutes >= startMin && nowMinutes <= endMin) {
            activeSlot = slot;
            break;
          }
        }
        
        if (!activeSlot && slots.length > 0) activeSlot = slots[0]; // fallback
        
        if (activeSlot) {
          setSelectedBranch(activeSlot.branch || "");
          setSelectedSemester(activeSlot.semester || "");
          setSelectedSubject(activeSlot.subject || "");
          setSelectedRoom(activeSlot.room || "");
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
      if (!u.regNo) return { branch: "N/A", semester: "N/A" };
      const prefix = u.regNo.substring(0, 8);
      const mapping = mappings.find(m => m.prefix === prefix);
      return mapping ? { branch: mapping.branch, semester: mapping.semester } : { branch: "Unmapped", semester: "Unmapped" };
    };

    const filtered = students.filter(s => {
      const meta = resolveStudentMeta(s);
      return meta.branch === selectedBranch && meta.semester === selectedSemester;
    });
    
    // Sort by name
    filtered.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    setFilteredStudents(filtered);
  }, [selectedBranch, selectedSemester, students, mappings]);

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
      const qrInterval = setInterval(() => {
        setQrNonce(prev => prev + 1);
      }, 5000);
      
      const timerInterval = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
             clearInterval(timerInterval);
             clearInterval(qrInterval);
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
           room: selectedRoom
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

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getStudentStatusColor = (status?: string) => {
    if (timeLeft > 0 && !status) return "bg-slate-900 border-slate-800 text-slate-400";
    if (timeLeft === 0 && !status) return "bg-rose-950/30 border-rose-900/50 text-rose-500"; // absent
    
    if (status === 'present') return "bg-emerald-950/40 border-emerald-500/50 text-emerald-400";
    if (status === 'proxy') return "bg-amber-950/40 border-amber-500/50 text-amber-400";
    if (status === 'absent') return "bg-rose-950/30 border-rose-900/50 text-rose-500";
    
    return "bg-slate-900 border-slate-800 text-slate-400";
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 overflow-x-hidden selection:bg-blue-500/30">
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-600/5 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-indigo-600/5 rounded-full blur-[120px]"></div>
      </div>

      {/* Header Area */}
      <header className="fixed top-0 inset-x-0 h-16 sm:h-20 flex items-center justify-between px-4 sm:px-10 glass-header z-50">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/40 border border-blue-400/20">
            <Monitor size={18} className="text-white sm:hidden" />
            <Monitor size={22} className="text-white hidden sm:block" />
          </div>
          <div>
            <h1 className="text-sm sm:text-lg font-black text-white tracking-tighter italic uppercase">Attendify <span className="text-blue-500 not-italic">SB</span></h1>
            <p className="text-[7px] sm:text-[9px] text-slate-500 font-black tracking-[0.2em] uppercase">Classroom Interface</p>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-6">
          <div className="text-right hidden xs:block">
             <p className="text-xs sm:text-sm font-black text-white font-mono">
               {isMounted ? currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "--:--:--"}
             </p>
             <p className="text-[7px] sm:text-[9px] text-slate-500 font-black uppercase tracking-widest">
               {isMounted ? currentTime.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) : "Loading..."}
             </p>
          </div>
          <div className="h-8 sm:h-10 w-[1px] bg-slate-800 hidden xs:block"></div>
          <div className="bg-slate-900/50 border border-slate-800 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg flex items-center gap-2 sm:gap-3">
             <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-blue-500 animate-pulse"></div>
             <span className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">{sessionId || "---"}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 w-full flex-1 flex flex-col items-center justify-center mt-20 mb-10">
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
                      <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-all">
                         <option value="">Select Branch</option>
                         {branches.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                   </div>
                   
                   <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400">Semester</label>
                      <select value={selectedSemester} onChange={e => setSelectedSemester(e.target.value)} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all">
                         <option value="">Select Semester</option>
                         {semesters.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                   </div>
                </div>

                <div className="space-y-4 relative z-10">
                   <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest border-b border-transparent pb-2 mb-4">&nbsp;</h3>
                   
                   <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400">Subject</label>
                      <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-all">
                         <option value="">Select Subject</option>
                         {subjects.filter(s => s.branch === selectedBranch).map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                      </select>
                   </div>

                   <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400">Room</label>
                      <input type="text" value={selectedRoom} onChange={e => setSelectedRoom(e.target.value)} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500 transition-all uppercase" placeholder="e.g. LAB-01" />
                   </div>
                </div>
             </div>

             <div className="w-full mt-6 flex justify-end">
                <button 
                  onClick={handleStartAttendance}
                  disabled={!selectedBranch || !selectedSemester || !selectedSubject || !selectedRoom}
                  className="btn-3d-blue py-3 px-8 text-sm uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                >
                   Start Session
                </button>
             </div>
          </div>
        )}

        {status === "marking-attendance" && (
          <div className="flex flex-col lg:flex-row gap-6 w-full max-w-[1400px] animate-in fade-in duration-700 px-2 sm:px-4 h-[calc(100vh-160px)]">
             {/* Left Area: Student Grid */}
             <div className="flex-1 card-premium p-4 sm:p-6 flex flex-col overflow-hidden relative">
                <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                   <LayoutGrid size={200} />
                </div>
                <div className="flex items-center justify-between mb-6 relative z-10">
                   <div>
                      <h3 className="text-xl sm:text-2xl font-black text-white">{selectedSubject}</h3>
                      <p className="text-xs text-slate-400 uppercase tracking-widest">{selectedBranch} • {selectedSemester} • {selectedRoom}</p>
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

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 overflow-y-auto pr-2 custom-scrollbar flex-1 content-start relative z-10 pb-10">
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
                            className={`p-3 rounded-lg border ${colorClass} ${timeLeft === 0 ? 'cursor-pointer hover:scale-105 shadow-xl' : 'cursor-default'} transition-all flex flex-col justify-between aspect-[4/3] backdrop-blur-sm`}
                         >
                            <p className="text-xs font-bold truncate text-white">{student.name}</p>
                            <div className="flex items-end justify-between mt-2">
                               <p className="text-xs font-black opacity-60 font-mono">
                                 {student.regNo ? student.regNo.slice(-4) : String(idx+1).padStart(2, '0')}
                               </p>
                               {finalStatus === 'present' && <CheckCircle size={16} className="text-emerald-400" />}
                               {finalStatus === 'proxy' && <AlertCircle size={16} className="text-amber-400" />}
                               {finalStatus === 'absent' && <XCircle size={16} className="text-rose-500" />}
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

             {/* Right Area: QR & Stats */}
             <div className="w-full lg:w-[340px] flex flex-col gap-6">
                <div className="card-premium p-6 flex flex-col items-center relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-4 opacity-5">
                      <Clock size={100} />
                   </div>
                   <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4 relative z-10">QR Session <span className="text-blue-500">{new Date().toLocaleDateString()}</span></h3>
                   
                   <div className="bg-white p-4 rounded-xl shadow-2xl w-full max-w-[240px] mb-6 relative z-10 ring-4 ring-white/10">
                      <QRCode value={`ATTENDANCE:${sessionId}:${qrNonce}`} style={{ height: "auto", maxWidth: "100%", width: "100%" }} level="H" />
                      {timeLeft === 0 && (
                         <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex items-center justify-center rounded-xl">
                            <p className="text-rose-600 font-black uppercase tracking-widest text-lg border-4 border-rose-600 px-4 py-2 rounded-lg rotate-[-10deg]">Locked</p>
                         </div>
                      )}
                   </div>
                   
                   <p className="text-[9px] text-slate-500 font-mono mb-4 text-center break-all relative z-10">
                      Session ID: {sessionId}
                   </p>
                   
                   <div className="flex flex-col items-center relative z-10">
                       <p className={`text-[10px] font-black uppercase tracking-[0.3em] mb-2 ${timeLeft === 0 ? 'text-rose-500' : 'text-slate-500'}`}>
                          {timeLeft === 0 ? 'Session Expired' : 'Time Remaining'}
                       </p>
                       <div className={`text-6xl font-black font-mono tracking-tighter ${timeLeft === 0 ? 'text-rose-500' : 'text-blue-400 drop-shadow-[0_0_20px_rgba(59,130,246,0.6)]'}`}>
                          {formatTime(timeLeft)}
                       </div>
                       {timeLeft === 0 && <p className="text-[10px] text-rose-400 mt-2 uppercase tracking-widest font-bold animate-pulse">Manual override active</p>}
                    </div>
                </div>

                 <div className="card-premium p-5 space-y-4">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5 pb-2">Status Legend</h4>
                    <button 
                       onClick={() => setFilterStatus("present")}
                       className={`w-full flex items-center gap-3 p-2 rounded-lg transition-all ${filterStatus === 'present' ? 'bg-emerald-500/20 border border-emerald-500/50 ring-2 ring-emerald-500/20' : 'hover:bg-white/5 border border-transparent'}`}
                    >
                       <div className="w-3 h-3 rounded bg-emerald-500 flex-shrink-0 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                       <p className="text-xs text-slate-300 font-black uppercase tracking-widest">Present</p>
                    </button>
                    
                    <button 
                       onClick={() => setFilterStatus("proxy")}
                       className={`w-full flex items-center gap-3 p-2 rounded-lg transition-all ${filterStatus === 'proxy' ? 'bg-amber-500/20 border border-amber-500/50 ring-2 ring-amber-500/20' : 'hover:bg-white/5 border border-transparent'}`}
                    >
                       <div className="w-3 h-3 rounded bg-amber-500 flex-shrink-0 shadow-[0_0_10px_rgba(245,158,11,0.5)]"></div>
                       <p className="text-xs text-slate-300 font-black uppercase tracking-widest">Suspected Proxy</p>
                    </button>
                    
                    <button 
                       onClick={() => setFilterStatus("absent")}
                       className={`w-full flex items-center gap-3 p-2 rounded-lg transition-all ${filterStatus === 'absent' ? 'bg-rose-500/20 border border-rose-500/50 ring-2 ring-rose-500/20' : 'hover:bg-white/5 border border-transparent'}`}
                    >
                       <div className="w-3 h-3 rounded bg-rose-500 flex-shrink-0 shadow-[0_0_10px_rgba(244,63,94,0.5)]"></div>
                       <p className="text-xs text-slate-300 font-black uppercase tracking-widest">Absent / Rejected</p>
                    </button>
                    
                    <button 
                       onClick={() => setFilterStatus("all")}
                       className={`w-full flex items-center gap-3 p-2 rounded-lg transition-all ${filterStatus === 'all' ? 'bg-blue-500/20 border border-blue-500/50 ring-2 ring-blue-500/20' : 'hover:bg-white/5 border border-transparent'}`}
                    >
                       <div className="w-3 h-3 rounded bg-slate-500 flex-shrink-0"></div>
                       <p className="text-xs text-slate-300 font-black uppercase tracking-widest">Pending / All</p>
                    </button>
                 </div>
             </div>
          </div>
        )}
      </main>

      {/* Footer Branding */}
      <footer className="fixed bottom-4 sm:bottom-6 text-center px-4 w-full pointer-events-none z-0">
         <p className="text-[7px] sm:text-[10px] font-black text-slate-700 uppercase tracking-[0.2em] sm:tracking-[0.4em]">Academic Ledger System v2.0</p>
      </footer>
    </div>
  );
}
