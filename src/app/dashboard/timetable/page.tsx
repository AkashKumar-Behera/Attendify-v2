"use client";

import { useState, useEffect } from "react";
import { 
  Calendar, 
  Clock, 
  BookOpen, 
  User, 
  Plus, 
  Search, 
  Filter, 
  X, 
  Save, 
  Trash2, 
  Edit2,
  MapPin, 
  Layers,
  Trophy,
  Users,
  ShieldCheck,
  Database,
  ChevronRight
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { db } from "@/lib/firebase";
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  deleteDoc, 
  updateDoc,
  doc, 
  orderBy 
} from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";

export default function TimetablePage() {
  const { userData } = useAuth();
  const [activeTab, setActiveTab] = useState<"timetable" | "leaderboard">("timetable");
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  
  const [branches, setBranches] = useState<any[]>([]);
  const [semesters, setSems] = useState<any[]>([]);
  const [allSubjects, setAllSubjects] = useState<any[]>([]);
  const [allTeachers, setAllTeachers] = useState<any[]>([]);
  const [batchMappings, setBatchMappings] = useState<any[]>([]);
  const [selectedDay, setSelectedDay] = useState(days[new Date().getDay() - 1] || "Monday");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [selectedSem, setSelectedSem] = useState("");
  const [isPersonalMode, setIsPersonalMode] = useState(false);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [subjectSearch, setSubjectSearch] = useState("");
  const [editSubjectSearch, setEditSubjectSearch] = useState("");
  const [editingSlot, setEditingSlot] = useState<any | null>(null);
  const [timetable, setTimetable] = useState<any[]>([]);
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Leaderboard State
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [leaderboardSubject, setLeaderboardSubject] = useState("All");
  const [leaderboardSection, setLeaderboardSection] = useState("All");
  const [leaderboardGroup, setLeaderboardGroup] = useState("All");

  // Set default mode for teachers
  useEffect(() => {
    if (userData?.role === 'teacher') {
      setIsPersonalMode(true);
    }
  }, [userData]);

  // New Slot Form State
  const [newSlot, setNewSlot] = useState({
    subject: "",
    teacher: "",
    room: "",
    startTime: "09:00",
    endTime: "10:00",
    branch: "",
    semester: "",
    section: "",
    group: ""
  });

  useEffect(() => {
    fetchConfigs();
  }, []);

  // Fetch timetable whenever filters change
  useEffect(() => {
    if (isPersonalMode || (selectedBranch && selectedSem)) {
      fetchTimetable();
    }
    if (selectedBranch && selectedSem) {
      fetchAvailableSubjects();
    }
  }, [selectedDay, selectedBranch, selectedSem, isPersonalMode]);

  // Fetch leaderboard data when active tab changes to leaderboard
  useEffect(() => {
    if (activeTab === 'leaderboard' && selectedBranch && selectedSem) {
      fetchLeaderboard();
    }
  }, [activeTab, selectedBranch, selectedSem, leaderboardSubject, leaderboardSection, leaderboardGroup]);

  const fetchLeaderboard = async () => {
    if (!selectedBranch || !selectedSem) return;
    setLoadingLeaderboard(true);
    setLeaderboardData([]);
    
    try {
      // 1. Get batch prefix and mapping from state or fetch if missing
      let mapping = batchMappings.find(m => m.branch === selectedBranch && m.semester === selectedSem);
      
      if (!mapping) {
         const bQuery = query(collection(db, "batchMappings"), 
            where("branch", "==", selectedBranch),
            where("semester", "==", selectedSem)
         );
         const bSnap = await getDocs(bQuery);
         if (!bSnap.empty) {
            mapping = { id: bSnap.docs[0].id, ...bSnap.docs[0].data() };
         }
      }

      if (!mapping || !mapping.prefix) {
         setLoadingLeaderboard(false);
         return;
      }

      const prefix = mapping.prefix;

      // 2. Get Students (Optimized Query - filter by prefix in Firestore if possible)
      // Note: We use regNo range to filter for students in the specific batch
      const usersRef = collection(db, "users");
      const q = query(
        usersRef, 
        where("role", "==", "student"),
        where("regNo", ">=", prefix),
        where("regNo", "<=", prefix + "\uf8ff")
      );
      const snapshot = await getDocs(q);
      const studentsInBranch = snapshot.docs.map(doc => doc.data());

      // 3. Resolve student meta and filter by section/group in memory
      const resolveStudentMeta = (u: any) => {
        let sectionMatch = "N/A";
        let groupMatch = "N/A";
        
        if (mapping && mapping.sections && u.regNo) {
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
        return { section: sectionMatch, group: groupMatch };
      };

      const filteredStudents = studentsInBranch.filter(s => {
        const meta = resolveStudentMeta(s);
        const sectionOk = leaderboardSection === "All" || meta.section === leaderboardSection;
        const groupOk = leaderboardGroup === "All" || meta.group === leaderboardGroup;
        return sectionOk && groupOk;
      });

      // 4. Get relevant subjects from timetable-based availableSubjects
      let relevantSubjects = [...availableSubjects];

      if (leaderboardSubject !== "All") {
         relevantSubjects = [leaderboardSubject];
      }

      const studentStats: Record<string, { present: number, total: number, name: string }> = {};
      filteredStudents.forEach(s => {
         studentStats[s.regNo] = { present: 0, total: 0, name: s.name || s.regNo };
      });

      if (relevantSubjects.length === 0) {
        setLoadingLeaderboard(false);
        return;
      }

      // 5. Fetch Attendance Dates for each subject in PARALLEL
      const cleanBranch = selectedBranch.replace(/[\s/]+/g, '_');
      const cleanSem = selectedSem.replace(/[\s/]+/g, '_');
      
      const attendancePromises = relevantSubjects.map(async (subject) => {
        const cleanSub = subject.replace(/[\s/]+/g, '_');
        const datesRef = collection(db, "SubjectAttendance", `${cleanBranch}_${cleanSem}_${cleanSub}`, "dates");
        return getDocs(datesRef);
      });

      const datesSnapshots = await Promise.all(attendancePromises);

      datesSnapshots.forEach(datesSnap => {
         datesSnap.forEach(doc => {
            const data = doc.data();
            // Optimization: Only iterate over studentStats keys once per date document
            Object.keys(studentStats).forEach(regNo => {
               studentStats[regNo].total += 1;
               if (data.attendance && data.attendance[regNo] === 'present') {
                  studentStats[regNo].present += 1;
               }
            });
         });
      });

      // 6. Calculate percentage and sort
      const leaderboard = Object.entries(studentStats)
        .map(([regNo, stats]) => {
           const percentage = stats.total > 0 ? (stats.present / stats.total) * 100 : 0;
           return {
              regNo,
              name: stats.name,
              present: stats.present,
              total: stats.total,
              percentage: Math.round(percentage)
           };
        })
        .filter(s => s.total > 0) // Only show students who had classes
        .sort((a, b) => b.percentage - a.percentage || b.total - a.total);

      setLeaderboardData(leaderboard);
    } catch (error) {
       console.error("Error fetching leaderboard:", error);
    } finally {
       setLoadingLeaderboard(false);
    }
  };

  const fetchConfigs = async () => {
    const [bSnap, sSnap, subSnap, teacherSnap, mSnap] = await Promise.all([
      getDocs(collection(db, "branches")),
      getDocs(collection(db, "semesters")),
      getDocs(collection(db, "subjects")),
      getDocs(query(collection(db, "users"), where("role", "==", "teacher"))),
      getDocs(collection(db, "batchMappings"))
    ]);
    
    const bData = bSnap.docs.map(doc => doc.data().name as string).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const sData = sSnap.docs.map(doc => doc.data().name as string).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const subjectsData = subSnap.docs.map(doc => ({
      name: doc.data().name as string,
      branch: doc.data().branch as string
    }));
    const teachersData = teacherSnap.docs.map(doc => ({ 
      name: doc.data().name as string, 
      branch: doc.data().branch as string 
    }));
    const mData = mSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    setBatchMappings(mData);
    setBranches(bData);
    setSems(sData);
    setAllSubjects(subjectsData);
    setAllTeachers(teachersData);

    if (subjectsData.length > 0) setNewSlot(prev => ({ ...prev, subject: subjectsData[0].name }));
    if (teachersData.length > 0) setNewSlot(prev => ({ ...prev, teacher: teachersData[0].name }));

    let defaultBranch = "";
    let defaultSem = "";

    // If student, find their mapped semester
    if (userData?.role === 'student' && userData?.prefix) {
      const mQuery = query(collection(db, "batchMappings"), where("prefix", "==", userData.prefix));
      const mSnap = await getDocs(mQuery);
      if (!mSnap.empty) {
        const mapping = mSnap.docs[0].data();
        defaultBranch = mapping.branch;
        defaultSem = mapping.semester;
      }
    } else if (userData?.role === 'teacher' && userData?.branch) {
      // If teacher, default to their own branch
      defaultBranch = userData.branch;
    }

    // Fallbacks if no specific mapping found
    if (!defaultBranch && bData.length > 0) defaultBranch = bData[0];
    if (!defaultSem && sData.length > 0) defaultSem = sData[0];

    setSelectedBranch(defaultBranch);
    setSelectedSem(defaultSem);
    setNewSlot(prev => ({ ...prev, branch: defaultBranch, semester: defaultSem }));
  };

  const fetchTimetable = async () => {
    setLoading(true);
    try {
      let q;
      if (isPersonalMode && userData?.name) {
        q = query(
          collection(db, "timetables"),
          where("day", "==", selectedDay),
          where("teacher", "==", userData.name)
        );
      } else {
        if (!selectedBranch || !selectedSem) {
          setTimetable([]);
          setLoading(false);
          return;
        }
        q = query(
          collection(db, "timetables"),
          where("day", "==", selectedDay),
          where("branch", "==", selectedBranch),
          where("semester", "==", selectedSem)
        );
      }
      
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      const sortedData = data.sort((a: any, b: any) => a.startTime.localeCompare(b.startTime));
      setTimetable(sortedData);
    } catch (error) {
      console.error("Error fetching timetable:", error);
      setTimetable([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableSubjects = async () => {
    if (!selectedBranch || !selectedSem) return;
    try {
      let q;
      if (isPersonalMode && userData?.name && userData?.role === 'teacher') {
        q = query(
          collection(db, "timetables"),
          where("branch", "==", selectedBranch),
          where("semester", "==", selectedSem),
          where("teacher", "==", userData.name)
        );
      } else {
        q = query(
          collection(db, "timetables"),
          where("branch", "==", selectedBranch),
          where("semester", "==", selectedSem)
        );
      }
      
      const snap = await getDocs(q);
      const subjects = new Set<string>();
      snap.forEach(doc => {
        const data = doc.data();
        if (data.subject) subjects.add(data.subject);
      });
      setAvailableSubjects(Array.from(subjects).sort());
    } catch (error) {
      console.error("Error fetching available subjects:", error);
    }
  };

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, "timetables"), {
        ...newSlot,
        day: selectedDay,
        createdAt: new Date()
      });
      setShowAddModal(false);
      fetchTimetable();
      setNewSlot({ ...newSlot, subject: "", teacher: "", room: "", startTime: "09:00", endTime: "10:00", branch: selectedBranch, semester: selectedSem, section: "", group: "" });
    } catch (error) {
      alert("Failed to add slot");
    }
  };

  const handleDeleteSlot = async (id: string) => {
    if (confirm("Delete this session?")) {
      await deleteDoc(doc(db, "timetables", id));
      fetchTimetable();
    }
  };

  const handleUpdateSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSlot) return;
    
    try {
      const docRef = doc(db, "timetables", editingSlot.id);
      await updateDoc(docRef, {
        subject: editingSlot.subject,
        teacher: editingSlot.teacher,
        room: editingSlot.room,
        startTime: editingSlot.startTime,
        endTime: editingSlot.endTime,
        branch: editingSlot.branch,
        semester: editingSlot.semester,
        section: editingSlot.section || "",
        group: editingSlot.group || ""
      });
      setEditingSlot(null);
      fetchTimetable();
    } catch (error) {
      console.error("Error updating slot:", error);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full space-y-6 animate-in fade-in duration-500 pb-20"
    >
      {/* Title & Primary Nav */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
           <h2 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
             <div className="p-2 md:p-3 bg-blue-600/20 rounded-lg border border-blue-500/30">
                <Calendar className="text-blue-400" size={24} />
             </div>
             Timetable
           </h2>
           <p className="text-sm text-slate-400 mt-2 ml-1 flex items-center gap-2">
             <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
             Class Schedule Overview
           </p>
        </div>

        <div className="w-fit flex flex-wrap items-center gap-2 p-1 bg-slate-900/50 backdrop-blur-xl rounded-lg border border-white/5">
            <button 
              onClick={() => setActiveTab('timetable')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${activeTab === 'timetable' ? 'bg-white text-slate-950' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              <Clock size={16} />
              <span>Timetable</span>
            </button>
            <button 
              onClick={() => setActiveTab('leaderboard')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${activeTab === 'leaderboard' ? 'bg-white text-slate-950' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              <Trophy size={16} />
              <span>Leaderboard</span>
            </button>

            {userData?.role === 'admin' && (
              <button 
                onClick={() => {
                  setShowAddModal(true);
                  setSubjectSearch("");
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 transition-all ml-auto"
              >
                <Plus size={16} />
                <span className="hidden sm:inline">Add Class</span>
              </button>
            )}
        </div>
      </div>

      {/* Mode Selector & Filter Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch mb-6">
        {userData?.role === 'teacher' && (
          <div className="lg:col-span-4 p-1.5 bg-slate-900/50 backdrop-blur-xl rounded-lg border border-white/5 flex flex-col sm:flex-row gap-2">
            <button 
              onClick={() => setIsPersonalMode(true)}
              className={`flex-1 p-3 rounded-lg transition-all duration-300 ${isPersonalMode ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-white/5'}`}
            >
              <div className="text-center">
                 <p className="text-sm font-semibold">My Classes</p>
              </div>
            </button>
            <button 
              onClick={() => setIsPersonalMode(false)}
              className={`flex-1 p-3 rounded-lg transition-all duration-300 ${!isPersonalMode ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-white/5'}`}
            >
              <div className="text-center">
                 <p className="text-sm font-semibold">All Classes</p>
              </div>
            </button>
          </div>
        )}

        <div className={`${(userData?.role === 'student' || userData?.role === 'admin') ? 'lg:col-span-12' : 'lg:col-span-8'} grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 md:p-5 bg-slate-900/50 backdrop-blur-xl rounded-lg border border-white/5`}>
          
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
              Branch
            </label>
            <div className="relative">
              <select 
                disabled={userData?.role === 'student' || isPersonalMode}
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className={`w-full bg-slate-950/80 border border-white/10 rounded-lg px-3 py-2 text-sm font-medium text-white focus:outline-none focus:border-blue-500/50 transition-all appearance-none ${(userData?.role === 'student' || isPersonalMode) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {branches.map((b, idx) => <option key={`branch-filter-${idx}`} value={b}>{b}</option>)}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                <ChevronRight size={14} className="rotate-90" />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></div>
              Semester
            </label>
            <div className="relative">
              <select 
                disabled={userData?.role === 'student' || isPersonalMode}
                value={selectedSem}
                onChange={(e) => setSelectedSem(e.target.value)}
                className={`w-full bg-slate-950/80 border border-white/10 rounded-lg px-3 py-2 text-sm font-medium text-white focus:outline-none focus:border-indigo-500/50 transition-all appearance-none ${(userData?.role === 'student' || isPersonalMode) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {semesters.map((s, idx) => <option key={`sem-filter-${idx}`} value={s}>{s}</option>)}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                <ChevronRight size={14} className="rotate-90" />
              </div>
            </div>
          </div>

          <div className="sm:col-span-2 flex flex-col justify-end">
             {isPersonalMode ? (
               <div className="p-3 bg-blue-600/10 border border-blue-500/20 rounded-lg flex items-center gap-3">
                  <div className="p-2 bg-blue-500/20 rounded-md">
                     <ShieldCheck size={18} className="text-blue-400" />
                  </div>
                  <div>
                     <p className="text-xs font-semibold text-blue-400 mb-0.5">Status</p>
                     <p className="text-sm font-bold text-white flex items-center gap-2">
                       My Classes
                       <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-ping"></span>
                     </p>
                  </div>
               </div>
             ) : (
               <div className="p-3 bg-slate-900 border border-white/10 rounded-lg flex items-center gap-3">
                  <div className="p-2 bg-slate-800 rounded-md">
                     <Search size={18} className="text-slate-400" />
                  </div>
                  <div>
                     <p className="text-xs font-semibold text-slate-400 mb-0.5">Status</p>
                     <p className="text-sm font-bold text-white">All Classes</p>
                  </div>
               </div>
             )}
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'timetable' ? (
          <motion.div 
            key="timetable"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="space-y-6"
          >
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
              {days.map(day => (
                <button
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border whitespace-nowrap ${selectedDay === day ? 'bg-white text-slate-950 border-white' : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'}`}
                >
                  {day.substring(0, 3)}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 space-y-4">
                {loading ? (
                  <div className="h-48 md:h-64 flex items-center justify-center bg-slate-900/50 rounded-lg border border-white/5 border-dashed">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-6 h-6 md:w-8 md:h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-xs md:text-sm font-medium text-slate-400">Loading Timetable...</p>
                    </div>
                  </div>
                ) : timetable.length === 0 ? (
                  <div className="h-48 md:h-64 flex flex-col items-center justify-center bg-slate-900/50 rounded-lg border border-white/5">
                    <div className="p-3 bg-slate-800 rounded-lg mb-3">
                      <Search className="text-slate-400" size={20} />
                    </div>
                    <p className="text-xs md:text-sm font-medium text-slate-400">
                      {isPersonalMode ? "No classes found." : `No classes for ${selectedBranch} ${selectedSem}.`}
                    </p>
                  </div>
                ) : (
                <div className="grid grid-cols-1 gap-3">
                  {timetable.sort((a, b) => a.startTime.localeCompare(b.startTime)).map((slot, idx) => (
                    <motion.div 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      key={slot.id} 
                      className="group relative overflow-hidden"
                    >
                      <div className="relative bg-slate-900 hover:bg-slate-800 border border-white/5 rounded-lg p-4 transition-all duration-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        
                        <div className="absolute left-0 top-3 bottom-3 w-1 bg-blue-600 rounded-r-md scale-y-0 group-hover:scale-y-100 transition-transform duration-300 origin-center"></div>

                        <div className="flex items-center gap-4 w-full sm:w-auto">
                           <div className="p-3 bg-slate-950 rounded-lg border border-white/5">
                              <BookOpen className="text-blue-400" size={20} />
                           </div>
                           
                           <div className="space-y-0.5">
                              <h4 className="text-base font-bold text-white line-clamp-1">
                                {slot.subject}
                              </h4>
                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                 <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded-md">
                                    <User size={12} className="text-blue-400" />
                                    <span className="text-xs font-semibold text-blue-400">{slot.teacher}</span>
                                 </div>
                                 <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-md">
                                    <MapPin size={12} className="text-indigo-400" />
                                    <span className="text-xs font-semibold text-indigo-400">{slot.room}</span>
                                 </div>
                                 {slot.section && (
                                   <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-md">
                                      <Users size={12} className="text-emerald-400" />
                                      <span className="text-xs font-semibold text-emerald-400">
                                        {slot.section}
                                      </span>
                                   </div>
                                 )}
                                 {slot.group && (
                                   <div className="flex items-center gap-1.5 px-2 py-1 bg-purple-500/10 border border-purple-500/20 rounded-md">
                                      <Users size={12} className="text-purple-400" />
                                      <span className="text-xs font-semibold text-purple-400">
                                        {slot.group}
                                      </span>
                                   </div>
                                 )}
                              </div>
                           </div>
                        </div>

                        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 border-white/10 pt-3 sm:pt-0">
                           <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-950 rounded-lg border border-white/5">
                              <Clock size={12} className="text-blue-400" />
                              <span className="text-xs font-bold text-white">
                                 {slot.startTime} - {slot.endTime}
                              </span>
                           </div>

                           {userData?.role === 'admin' && (
                             <div className="flex items-center gap-2">
                               <button 
                                 onClick={() => setEditingSlot(slot)}
                                 className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all"
                                 title="Edit"
                               >
                                  <Edit2 size={14} />
                               </button>
                               <button 
                                 onClick={() => handleDeleteSlot(slot.id)}
                                 className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-lg transition-all"
                                 title="Delete"
                               >
                                  <Trash2 size={14} />
                               </button>
                             </div>
                           )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
                )}
              </div>

              <div className="lg:col-span-4 space-y-4">
                 <div className="bg-slate-900 border border-white/5 p-5 rounded-lg">
                    <div className="flex items-center gap-2 mb-4">
                       <Layers className="text-blue-500" size={18} />
                       <h3 className="text-sm font-semibold text-white">Stats</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                       <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                          <p className="text-[10px] font-medium text-slate-400 mb-1">CLASSES</p>
                          <p className="text-xl font-bold text-white">{timetable.length}</p>
                       </div>
                       <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                          <p className="text-[10px] font-medium text-slate-400 mb-1">BATCH</p>
                          <p className="text-sm font-bold text-blue-400 mt-1 line-clamp-1">{selectedBranch || 'None'}</p>
                       </div>
                    </div>
                 </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="leaderboard"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex-1 overflow-hidden flex flex-col space-y-4"
          >
            {/* Leaderboard Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-4 bg-slate-900/50 backdrop-blur-xl rounded-lg border border-white/5">
              <div className="sm:col-span-2 space-y-1.5">
                <div className="flex items-center justify-between h-5">
                  <label className="text-xs font-semibold text-slate-400">Subject</label>
                  {userData?.role !== 'student' && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-slate-950/50 rounded-md border border-white/5 focus-within:border-blue-500/30 transition-all w-48">
                      <Search size={12} className="text-slate-500 shrink-0" />
                      <input 
                        type="text" 
                        placeholder="Search subject..."
                        value={subjectSearch}
                        onChange={(e) => setSubjectSearch(e.target.value)}
                        className="bg-transparent border-none focus:outline-none text-[10px] text-slate-300 w-full placeholder:text-slate-600"
                      />
                    </div>
                  )}
                </div>
                <div className="relative">
                  <select 
                    value={leaderboardSubject}
                    onChange={(e) => setLeaderboardSubject(e.target.value)}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 appearance-none"
                  >
                    <option value="All">All Subjects</option>
                    {(() => {
                      const filtered = availableSubjects.filter(s => s.toLowerCase().includes(subjectSearch.toLowerCase()));
                      const theory = filtered.filter(s => !s.toLowerCase().includes('lab'));
                      const labs = filtered.filter(s => s.toLowerCase().includes('lab'));
                      
                      return (
                        <>
                          {theory.length > 0 && (
                            <optgroup label="Theory" className="bg-slate-900 text-blue-400 font-bold">
                              {theory.map((sub, idx) => (
                                <option key={`sub-filter-th-${idx}`} value={sub} className="bg-slate-950 text-white font-normal">{sub}</option>
                              ))}
                            </optgroup>
                          )}
                          {labs.length > 0 && (
                            <optgroup label="Labs" className="bg-slate-900 text-emerald-400 font-bold">
                              {labs.map((sub, idx) => (
                                <option key={`sub-filter-lab-${idx}`} value={sub} className="bg-slate-950 text-white font-normal">{sub}</option>
                              ))}
                            </optgroup>
                          )}
                        </>
                      );
                    })()}
                  </select>
                  <ChevronRight size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 rotate-90 pointer-events-none" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400">Section</label>
                <div className="relative">
                  <select 
                    value={leaderboardSection}
                    onChange={(e) => {
                      setLeaderboardSection(e.target.value);
                      setLeaderboardGroup("All"); // Reset group when section changes
                    }}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 appearance-none"
                  >
                    <option value="All">All Sections</option>
                    {(batchMappings.find(m => m.branch === selectedBranch && m.semester === selectedSem)?.sections || []).map((sec: any, idx: number) => (
                      <option key={`sec-filter-${idx}`} value={sec.name}>{sec.name}</option>
                    ))}
                  </select>
                  <ChevronRight size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 rotate-90 pointer-events-none" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400">Group</label>
                <div className="relative">
                  <select 
                    value={leaderboardGroup}
                    onChange={(e) => setLeaderboardGroup(e.target.value)}
                    className={`w-full bg-slate-950/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 appearance-none ${leaderboardSection === 'All' ? 'opacity-50 cursor-not-allowed' : ''}`}
                    disabled={leaderboardSection === 'All'}
                  >
                    <option value="All">All Groups</option>
                    {(batchMappings.find(m => m.branch === selectedBranch && m.semester === selectedSem)?.sections?.find((s: any) => s.name === leaderboardSection)?.groups || []).map((grp: any, idx: number) => (
                      <option key={`grp-filter-${idx}`} value={grp.name}>{grp.name}</option>
                    ))}
                  </select>
                  <ChevronRight size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 rotate-90 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="bg-slate-900/50 rounded-lg border border-white/5 overflow-hidden flex flex-col">
            {loadingLeaderboard ? (
              <div className="h-64 flex items-center justify-center">
                 <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : leaderboardData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 bg-slate-950/50">
                      <th className="p-4 text-xs font-semibold text-slate-400">Rank</th>
                      <th className="p-4 text-xs font-semibold text-slate-400">Student</th>
                      <th className="p-4 text-xs font-semibold text-slate-400">Reg No</th>
                      <th className="p-4 text-xs font-semibold text-slate-400 text-right">Classes Attended</th>
                      <th className="p-4 text-xs font-semibold text-slate-400 text-right">Attendance %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboardData.map((student, index) => (
                      <tr key={student.regNo} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        <td className="p-4">
                          {index < 3 ? (
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                              index === 0 ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30' :
                              index === 1 ? 'bg-slate-300/20 text-slate-300 border border-slate-300/30' :
                              'bg-amber-600/20 text-amber-600 border border-amber-600/30'
                            }`}>
                              {index + 1}
                            </div>
                          ) : (
                            <span className="text-slate-500 font-medium ml-2">{index + 1}</span>
                          )}
                        </td>
                        <td className="p-4 font-medium text-slate-200">{student.name}</td>
                        <td className="p-4 text-slate-400 text-sm font-mono">{student.regNo}</td>
                        <td className="p-4 text-slate-300 text-right">{student.present} / {student.total}</td>
                        <td className="p-4 text-right">
                          <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold ${
                            student.percentage >= 75 ? 'bg-emerald-500/10 text-emerald-400' :
                            student.percentage >= 60 ? 'bg-amber-500/10 text-amber-400' :
                            'bg-rose-500/10 text-rose-400'
                          }`}>
                            {student.percentage}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center gap-3">
                 <div className="p-4 bg-slate-800 rounded-full border border-slate-700">
                    <Trophy className="text-slate-500" size={32} />
                 </div>
                 <h3 className="text-base font-bold text-slate-300">No Leaderboard Data</h3>
                 <p className="text-xs text-slate-500 text-center px-4">There are no attendance records for this branch and semester yet.</p>
              </div>
            )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Slot Modal */}
      <AnimatePresence>
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-xl bg-slate-900 border border-white/10 rounded-lg p-5 md:p-6 shadow-2xl relative overflow-hidden"
            >

              <div className="relative flex items-center justify-between mb-6">
                 <div>
                    <h3 className="text-xl font-bold text-white flex items-center gap-3">
                       <div className="p-2 bg-blue-600/20 rounded-lg">
                          <Plus className="text-blue-400" size={20} />
                       </div>
                       Add New Class
                    </h3>
                    <p className="text-sm text-slate-400 mt-1">Schedule a class for {selectedDay}</p>
                 </div>
                 <button 
                   onClick={() => {
                     setShowAddModal(false);
                     setSubjectSearch("");
                   }} 
                   className="p-2 bg-slate-800 rounded-lg border border-white/5 text-slate-400 hover:text-white transition-all"
                 >
                   <X size={20}/>
                 </button>
              </div>

              <form onSubmit={handleAddSlot} className="relative space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                       <label className="text-xs font-semibold text-slate-400 flex items-center gap-2">
                          <Database size={14} className="text-blue-400" />
                          Branch
                       </label>
                       <select 
                         value={newSlot.branch}
                         onChange={e => setNewSlot({...newSlot, branch: e.target.value, teacher: "", subject: ""})}
                         className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-all"
                       >
                         <option value="">Select Branch</option>
                         {branches.map((b, idx) => <option key={`modal-branch-${idx}`} value={b}>{b}</option>)}
                       </select>
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-xs font-semibold text-slate-400 flex items-center gap-2">
                          <Layers size={14} className="text-indigo-400" />
                          Semester
                       </label>
                       <select 
                         value={newSlot.semester}
                         onChange={e => setNewSlot({...newSlot, semester: e.target.value, section: "", group: ""})}
                         className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all"
                       >
                         <option value="">Select Sem</option>
                         {semesters.map((s, idx) => <option key={`modal-sem-${idx}`} value={s}>{s}</option>)}
                       </select>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                       <label className="text-xs font-semibold text-slate-400 flex items-center gap-2">
                          <Users size={14} className="text-emerald-400" />
                          Section (Optional)
                       </label>
                       <select 
                         value={newSlot.section || ""}
                         onChange={e => setNewSlot({...newSlot, section: e.target.value, group: ""})}
                         className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-all"
                       >
                         <option value="">All Sections</option>
                         {batchMappings
                           .find(m => m.branch === newSlot.branch && m.semester === newSlot.semester)?.sections
                           ?.map((sec: any, idx: number) => (
                             <option key={`modal-sec-${idx}`} value={sec.name}>{sec.name}</option>
                         ))}
                       </select>
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-xs font-semibold text-slate-400 flex items-center gap-2">
                          <Users size={14} className="text-emerald-400" />
                          Group (Optional)
                       </label>
                       <select 
                         value={newSlot.group || ""}
                         onChange={e => setNewSlot({...newSlot, group: e.target.value})}
                         disabled={!newSlot.section}
                         className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-all disabled:opacity-50"
                       >
                         <option value="">All Groups</option>
                         {batchMappings
                           .find(m => m.branch === newSlot.branch && m.semester === newSlot.semester)?.sections
                           ?.find((s: any) => s.name === newSlot.section)?.groups
                           ?.map((grp: any, idx: number) => (
                             <option key={`modal-grp-${idx}`} value={grp.name}>{grp.name}</option>
                         ))}
                       </select>
                    </div>
                 </div>

                  <div className="space-y-1.5">
                     <label className="text-xs font-semibold text-slate-400 flex items-center gap-2">
                        <BookOpen size={14} className="text-emerald-400" />
                        Subject Selection
                     </label>
                     <div className="flex flex-col sm:flex-row gap-2">
                        <div className="flex-1 relative">
                           <select 
                             value={newSlot.subject}
                             onChange={e => setNewSlot({...newSlot, subject: e.target.value})}
                             className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-all appearance-none"
                           >
                              {!newSlot.branch ? (
                                <option value="">Select Branch First</option>
                              ) : (
                                <>
                                  <option value="">Select Subject</option>
                                  {(() => {
                                    const filtered = allSubjects
                                      .filter((s: any) => s.branch === newSlot.branch && (!s.semester || s.semester === newSlot.semester) && s.name.toLowerCase().includes(subjectSearch.toLowerCase()))
                                      .sort((a: any, b: any) => a.name.localeCompare(b.name));
                                    
                                    const theory = filtered.filter((s: any) => !s.name.toLowerCase().includes('lab'));
                                    const labs = filtered.filter((s: any) => s.name.toLowerCase().includes('lab'));

                                    return (
                                      <>
                                        {theory.length > 0 && (
                                          <optgroup label="Theory Subjects" className="bg-slate-900 text-blue-400 font-bold">
                                            {theory.map((s: any, idx: number) => (
                                              <option key={`edit-sub-th-${idx}`} value={s.name} className="bg-slate-950 text-white font-normal">{s.name}</option>
                                            ))}
                                          </optgroup>
                                        )}
                                        {labs.length > 0 && (
                                          <optgroup label="Labs / Practicals" className="bg-slate-900 text-emerald-400 font-bold">
                                            {labs.map((s: any, idx: number) => (
                                              <option key={`edit-sub-lab-${idx}`} value={s.name} className="bg-slate-950 text-white font-normal">{s.name}</option>
                                            ))}
                                          </optgroup>
                                        )}
                                      </>
                                    );
                                  })()}
                                </>
                              )}
                           </select>
                           <ChevronRight size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 rotate-90 pointer-events-none" />
                        </div>
                        
                        {newSlot.branch && (
                           <div className="flex items-center gap-2 bg-slate-950 border border-white/10 px-3 py-2 rounded-lg focus-within:border-emerald-500/50 transition-all w-full sm:w-48">
                              <Search size={14} className="text-slate-500" />
                              <input 
                                type="text"
                                placeholder="Search..."
                                value={subjectSearch}
                                onChange={(e) => setSubjectSearch(e.target.value)}
                                className="bg-transparent border-none focus:outline-none text-sm text-slate-300 w-full placeholder:text-slate-600"
                              />
                           </div>
                        )}
                     </div>
                  </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                       <label className="text-xs font-semibold text-slate-400 flex items-center gap-2">
                          <User size={14} className="text-amber-400" />
                          Teacher
                       </label>
                       <select 
                         value={newSlot.teacher}
                         onChange={e => setNewSlot({...newSlot, teacher: e.target.value})}
                         className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-all"
                       >
                         {!newSlot.branch ? (
                           <option value="">Select Branch First</option>
                         ) : (
                           <>
                             <option value="">Select Teacher</option>
                             {allTeachers
                               .filter((t: any) => t.branch === newSlot.branch)
                               .map((t: any, idx: number) => (
                                 <option key={`modal-teacher-${idx}`} value={t.name}>{t.name}</option>
                               ))
                             }
                           </>
                          )}
                       </select>
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-xs font-semibold text-slate-400 flex items-center gap-2">
                          <MapPin size={14} className="text-rose-400" />
                          Room
                       </label>
                       <input 
                         type="text" required
                         value={newSlot.room}
                         onChange={e => setNewSlot({...newSlot, room: e.target.value})}
                         className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500 transition-all placeholder:text-slate-600 uppercase" 
                         placeholder="e.g. LAB-01" 
                       />
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5 p-3 bg-slate-950/50 rounded-lg border border-white/5">
                       <label className="text-xs font-semibold text-blue-400 flex items-center gap-2">
                          <Clock size={14} />
                          From
                       </label>
                       <input 
                         type="time" required
                         value={newSlot.startTime}
                         onChange={e => setNewSlot({...newSlot, startTime: e.target.value})}
                         className="w-full bg-transparent text-base font-bold text-white outline-none cursor-pointer" 
                       />
                    </div>
                    <div className="space-y-1.5 p-3 bg-slate-950/50 rounded-lg border border-white/5">
                       <label className="text-xs font-semibold text-indigo-400 flex items-center gap-2">
                          <Clock size={14} />
                          To
                       </label>
                       <input 
                         type="time" required
                         value={newSlot.endTime}
                         onChange={e => setNewSlot({...newSlot, endTime: e.target.value})}
                         className="w-full bg-transparent text-base font-bold text-white outline-none cursor-pointer" 
                       />
                    </div>
                 </div>

                 <button type="submit" className="w-full py-3 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-500 transition-all flex items-center justify-center gap-2 mt-2">
                    <Save size={18} />
                    Save Class
                 </button>
              </form>
            </motion.div>
        </div>
      )}
      </AnimatePresence>

      {/* Edit Slot Modal */}
      <AnimatePresence>
      {editingSlot && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-xl bg-slate-900 border border-white/10 rounded-lg p-5 md:p-6 shadow-2xl relative overflow-hidden"
            >

              <div className="relative flex items-center justify-between mb-6">
                 <div>
                    <h3 className="text-xl font-bold text-white flex items-center gap-3">
                       <div className="p-2 bg-emerald-600/20 rounded-lg">
                          <Edit2 className="text-emerald-400" size={20} />
                       </div>
                       Edit Class
                    </h3>
                    <p className="text-sm text-slate-400 mt-1">Update schedule details</p>
                 </div>
                 <button 
                   onClick={() => {
                     setEditingSlot(null);
                     setEditSubjectSearch("");
                   }} 
                   className="p-2 bg-slate-800 rounded-lg border border-white/5 text-slate-400 hover:text-white transition-all"
                 >
                   <X size={20}/>
                 </button>
              </div>

              <form onSubmit={handleUpdateSlot} className="relative space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                       <label className="text-xs font-semibold text-slate-400 flex items-center gap-2">
                          <Database size={14} className="text-blue-400" />
                          Branch
                       </label>
                       <select 
                         value={editingSlot.branch}
                         onChange={e => setEditingSlot({...editingSlot, branch: e.target.value, teacher: "", subject: ""})}
                         className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-all"
                       >
                         {branches.map((b, idx) => <option key={`edit-branch-${idx}`} value={b}>{b}</option>)}
                       </select>
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-xs font-semibold text-slate-400 flex items-center gap-2">
                          <Layers size={14} className="text-indigo-400" />
                          Semester
                       </label>
                       <select 
                         value={editingSlot.semester}
                         onChange={e => setEditingSlot({...editingSlot, semester: e.target.value, section: "", group: ""})}
                         className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all"
                       >
                         {semesters.map((s, idx) => <option key={`edit-sem-${idx}`} value={s}>{s}</option>)}
                       </select>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                       <label className="text-xs font-semibold text-slate-400 flex items-center gap-2">
                          <Users size={14} className="text-emerald-400" />
                          Section (Optional)
                       </label>
                       <select 
                         value={editingSlot.section || ""}
                         onChange={e => setEditingSlot({...editingSlot, section: e.target.value, group: ""})}
                         className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-all"
                       >
                         <option value="">All Sections</option>
                         {batchMappings
                           .find(m => m.branch === editingSlot.branch && m.semester === editingSlot.semester)?.sections
                           ?.map((sec: any, idx: number) => (
                             <option key={`edit-sec-${idx}`} value={sec.name}>{sec.name}</option>
                         ))}
                       </select>
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-xs font-semibold text-slate-400 flex items-center gap-2">
                          <Users size={14} className="text-emerald-400" />
                          Group (Optional)
                       </label>
                       <select 
                         value={editingSlot.group || ""}
                         onChange={e => setEditingSlot({...editingSlot, group: e.target.value})}
                         disabled={!editingSlot.section}
                         className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-all disabled:opacity-50"
                       >
                         <option value="">All Groups</option>
                         {batchMappings
                           .find(m => m.branch === editingSlot.branch && m.semester === editingSlot.semester)?.sections
                           ?.find((s: any) => s.name === editingSlot.section)?.groups
                           ?.map((grp: any, idx: number) => (
                             <option key={`edit-grp-${idx}`} value={grp.name}>{grp.name}</option>
                         ))}
                       </select>
                    </div>
                 </div>

                  <div className="space-y-1.5">
                     <label className="text-xs font-semibold text-slate-400 flex items-center gap-2">
                        <BookOpen size={14} className="text-emerald-400" />
                        Subject Selection
                     </label>
                     <div className="flex flex-col sm:flex-row gap-2">
                        <div className="flex-1 relative">
                           <select 
                             value={editingSlot.subject}
                             onChange={e => setEditingSlot({...editingSlot, subject: e.target.value})}
                             className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-all appearance-none"
                           >
                              {!editingSlot.branch ? (
                                <option value="">Select Branch First</option>
                              ) : (
                                <>
                                  <option value="">Select Subject</option>
                                  {(() => {
                                    const filtered = allSubjects
                                      .filter((s: any) => s.branch === editingSlot.branch && (!s.semester || s.semester === editingSlot.semester) && s.name.toLowerCase().includes(editSubjectSearch.toLowerCase()))
                                      .sort((a: any, b: any) => a.name.localeCompare(b.name));
                                    
                                    const theory = filtered.filter((s: any) => !s.name.toLowerCase().includes('lab'));
                                    const labs = filtered.filter((s: any) => s.name.toLowerCase().includes('lab'));

                                    return (
                                      <>
                                        {theory.length > 0 && (
                                          <optgroup label="Theory Subjects" className="bg-slate-900 text-blue-400 font-bold">
                                            {theory.map((s: any, idx: number) => (
                                              <option key={`edit-sub-th-${idx}`} value={s.name} className="bg-slate-950 text-white font-normal">{s.name}</option>
                                            ))}
                                          </optgroup>
                                        )}
                                        {labs.length > 0 && (
                                          <optgroup label="Labs / Practicals" className="bg-slate-900 text-emerald-400 font-bold">
                                            {labs.map((s: any, idx: number) => (
                                              <option key={`edit-sub-lab-${idx}`} value={s.name} className="bg-slate-950 text-white font-normal">{s.name}</option>
                                            ))}
                                          </optgroup>
                                        )}
                                      </>
                                    );
                                  })()}
                                </>
                              )}
                           </select>
                           <ChevronRight size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 rotate-90 pointer-events-none" />
                        </div>
                        
                        {editingSlot.branch && (
                           <div className="flex items-center gap-2 bg-slate-950 border border-white/10 px-3 py-2 rounded-lg focus-within:border-emerald-500/50 transition-all w-full sm:w-48">
                              <Search size={14} className="text-slate-500" />
                              <input 
                                type="text"
                                placeholder="Search..."
                                value={editSubjectSearch}
                                onChange={(e) => setEditSubjectSearch(e.target.value)}
                                className="bg-transparent border-none focus:outline-none text-sm text-slate-300 w-full placeholder:text-slate-600"
                              />
                           </div>
                        )}
                     </div>
                  </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                       <label className="text-xs font-semibold text-slate-400 flex items-center gap-2">
                          <User size={14} className="text-amber-400" />
                          Teacher
                       </label>
                       <select 
                         value={editingSlot.teacher}
                         onChange={e => setEditingSlot({...editingSlot, teacher: e.target.value})}
                         className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-all"
                       >
                         {!editingSlot.branch ? (
                           <option value="">Select Branch First</option>
                         ) : (
                           <>
                             <option value="">Select Teacher</option>
                             {allTeachers
                               .filter((t: any) => t.branch === editingSlot.branch)
                               .map((t: any, idx: number) => (
                                 <option key={`edit-teacher-${idx}`} value={t.name}>{t.name}</option>
                               ))
                             }
                           </>
                          )}
                       </select>
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-xs font-semibold text-slate-400 flex items-center gap-2">
                          <MapPin size={14} className="text-rose-400" />
                          Room
                       </label>
                       <input 
                         type="text" required
                         value={editingSlot.room}
                         onChange={e => setEditingSlot({...editingSlot, room: e.target.value})}
                         className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500 transition-all placeholder:text-slate-600 uppercase" 
                         placeholder="e.g. LAB-01"
                       />
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5 p-3 bg-slate-950/50 rounded-lg border border-white/5">
                       <label className="text-xs font-semibold text-emerald-400 flex items-center gap-2">
                          <Clock size={14} />
                          From
                       </label>
                       <input 
                         type="time" required
                         value={editingSlot.startTime}
                         onChange={e => setEditingSlot({...editingSlot, startTime: e.target.value})}
                         className="w-full bg-transparent text-base font-bold text-white outline-none cursor-pointer" 
                       />
                    </div>
                    <div className="space-y-1.5 p-3 bg-slate-950/50 rounded-lg border border-white/5">
                       <label className="text-xs font-semibold text-teal-400 flex items-center gap-2">
                          <Clock size={14} />
                          To
                       </label>
                       <input 
                         type="time" required
                         value={editingSlot.endTime}
                         onChange={e => setEditingSlot({...editingSlot, endTime: e.target.value})}
                         className="w-full bg-transparent text-base font-bold text-white outline-none cursor-pointer" 
                       />
                    </div>
                 </div>

                 <button type="submit" className="w-full py-3 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-500 transition-all flex items-center justify-center gap-2 mt-2">
                    <Save size={18} />
                    Save Changes
                 </button>
              </form>
            </motion.div>
        </div>
      )}
      </AnimatePresence>
    </motion.div>
  );
}
