"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { 
  History, 
  Search, 
  Download, 
  Filter, 
  Calendar,
  Layers,
  Database,
  BookOpen
} from "lucide-react";
import { motion } from "framer-motion";

export default function HistoryPage() {
  const { userData } = useAuth();
  
  const [teacherClasses, setTeacherClasses] = useState<any[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [semesters, setSemesters] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  
  const [selectedBranch, setSelectedBranch] = useState("");
  const [selectedSem, setSelectedSem] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [totalClasses, setTotalClasses] = useState(0);

  useEffect(() => {
    if (userData?.name) {
      fetchTeacherClasses();
    }
  }, [userData]);

  useEffect(() => {
    if (selectedBranch) {
      const sems = Array.from(new Set(teacherClasses.filter(c => c.branch === selectedBranch).map(c => c.semester)));
      setSemesters(sems as string[]);
      setSelectedSem("");
      setSelectedSubject("");
    }
  }, [selectedBranch]);

  useEffect(() => {
    if (selectedBranch && selectedSem) {
      const subs = Array.from(new Set(teacherClasses.filter(c => c.branch === selectedBranch && c.semester === selectedSem).map(c => c.subject)));
      setSubjects(subs as string[]);
      setSelectedSubject("");
    }
  }, [selectedSem]);

  const fetchTeacherClasses = async () => {
    try {
      // Get timetables for this teacher
      let q;
      if (userData?.role === 'admin') {
        q = query(collection(db, "timetables"));
      } else {
        q = query(collection(db, "timetables"), where("teacher", "==", userData?.name));
      }
      
      const snap = await getDocs(q);
      const classes = snap.docs.map(doc => doc.data());
      setTeacherClasses(classes);
      
      const uniqueBranches = Array.from(new Set(classes.map(c => c.branch)));
      setBranches(uniqueBranches as string[]);
    } catch (err) {
      console.error("Error fetching teacher classes:", err);
    }
  };

  const fetchHistory = async () => {
    if (!selectedBranch || !selectedSem || !selectedSubject) return;
    setLoading(true);
    setAttendanceRecords([]);
    
    try {
      // 1. Get batch prefix
      const bQuery = query(collection(db, "batchMappings"), 
         where("branch", "==", selectedBranch),
         where("semester", "==", selectedSem)
      );
      const bSnap = await getDocs(bQuery);
      let prefix = "";
      if (!bSnap.empty) {
         prefix = bSnap.docs[0].data().prefix;
      }

      if (!prefix) {
         alert("Batch mapping prefix not found for this Branch and Semester.");
         setLoading(false);
         return;
      }

      // 2. Get Students
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("role", "==", "student"));
      const snapshot = await getDocs(q);
      const allStudents = snapshot.docs.map(doc => doc.data());
      const filteredStudents = allStudents.filter(s => s.regNo?.startsWith(prefix));

      // 3. Get Attendance Dates
      const cleanBranch = selectedBranch.replace(/\s+/g, '_');
      const cleanSem = selectedSem.replace(/\s+/g, '_');
      const cleanSub = selectedSubject.replace(/\s+/g, '_');
      
      const datesRef = collection(db, "SubjectAttendance", `${cleanBranch}_${cleanSem}_${cleanSub}`, "dates");
      const datesSnap = await getDocs(datesRef);
      
      // Filter dates to last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const validDates: any[] = [];
      datesSnap.forEach(doc => {
        const data = doc.data();
        // Parse "13-5-2026"
        const [day, month, year] = data.date.split('-');
        const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        if (dateObj >= thirtyDaysAgo) {
          validDates.push(data);
        }
      });

      setTotalClasses(validDates.length);

      // 4. Aggregate Data
      const records = filteredStudents.map(student => {
        let presentCount = 0;
        let absentCount = 0;
        
        validDates.forEach(dateRecord => {
          const status = dateRecord.attendance[student.regNo];
          if (status === 'present') presentCount++;
          else absentCount++; // Treat unrecorded as absent if date exists
        });

        const total = presentCount + absentCount;
        const avg = total > 0 ? Math.round((presentCount / total) * 100) : 0;

        return {
          name: student.name,
          regNo: student.regNo,
          email: student.email,
          present: presentCount,
          absent: absentCount,
          avg: avg
        };
      });

      // Sort by avg descending
      records.sort((a, b) => b.avg - a.avg);
      setAttendanceRecords(records);

    } catch (err) {
      console.error("Error fetching history:", err);
      alert("Failed to load attendance records.");
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (attendanceRecords.length === 0) return;
    
    const headers = ["Sl No", "Student Regd No", "Name", "Subject", "Present", "Absent", "Avg %", "Date Range", "Student Email"];
    const dateRange = `Last ${totalClasses} Classes (30 Days)`;
    
    const rows = attendanceRecords.map((rec, idx) => [
      idx + 1,
      rec.regNo,
      `"${rec.name}"`, // Quote to handle commas
      `"${selectedSubject}"`,
      rec.present,
      rec.absent,
      `${rec.avg}%`,
      `"${dateRange}"`,
      rec.email
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Attendance_${selectedBranch}_${selectedSem}_${selectedSubject}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full space-y-6 animate-in fade-in duration-500 pb-20"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
           <h2 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
             <div className="p-2 md:p-3 bg-blue-600/20 rounded-lg border border-blue-500/30">
                <History className="text-blue-400" size={24} />
             </div>
             Class Records
           </h2>
           <p className="text-sm text-slate-400 mt-2 ml-1 flex items-center gap-2">
             <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
             Past 30 Days Attendance History
           </p>
        </div>
        
        {attendanceRecords.length > 0 && (
          <button 
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white transition-all ml-auto"
          >
            <Download size={18} />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 md:p-5 bg-slate-900/50 backdrop-blur-xl rounded-lg border border-white/5">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-400 flex items-center gap-2">
            <Database size={14} className="text-blue-400" />
            Branch
          </label>
          <select 
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="w-full bg-slate-950/80 border border-white/10 rounded-lg px-3 py-2 text-sm font-medium text-white focus:outline-none focus:border-blue-500/50 transition-all"
          >
            <option value="">Select Branch</option>
            {branches.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-400 flex items-center gap-2">
            <Layers size={14} className="text-indigo-400" />
            Semester
          </label>
          <select 
            value={selectedSem}
            onChange={(e) => setSelectedSem(e.target.value)}
            disabled={!selectedBranch}
            className="w-full bg-slate-950/80 border border-white/10 rounded-lg px-3 py-2 text-sm font-medium text-white focus:outline-none focus:border-indigo-500/50 transition-all disabled:opacity-50"
          >
            <option value="">Select Semester</option>
            {semesters.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-400 flex items-center gap-2">
            <BookOpen size={14} className="text-emerald-400" />
            Subject
          </label>
          <select 
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            disabled={!selectedSem}
            className="w-full bg-slate-950/80 border border-white/10 rounded-lg px-3 py-2 text-sm font-medium text-white focus:outline-none focus:border-emerald-500/50 transition-all disabled:opacity-50"
          >
            <option value="">Select Subject</option>
            {subjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="flex items-end">
          <button 
            onClick={fetchHistory}
            disabled={!selectedSubject || loading}
            className="w-full h-[38px] flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm transition-all disabled:opacity-50"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <Search size={16} />
                Find Records
              </>
            )}
          </button>
        </div>
      </div>

      <div className="bg-slate-900 border border-white/5 rounded-xl overflow-hidden relative min-h-[300px]">
        {loading ? (
           <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm z-10">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
           </div>
        ) : attendanceRecords.length === 0 ? (
           <div className="h-[300px] flex flex-col items-center justify-center opacity-50">
              <Calendar size={48} className="mb-4 text-slate-500" />
              <p className="text-sm font-medium text-slate-400">Select a class to view past records</p>
           </div>
        ) : (
           <div className="overflow-x-auto">
             <table className="w-full text-left text-sm whitespace-nowrap">
               <thead className="bg-slate-950/50 border-b border-white/5 text-slate-400">
                 <tr>
                   <th className="px-6 py-4 font-semibold">Sl No</th>
                   <th className="px-6 py-4 font-semibold">Student Reg No</th>
                   <th className="px-6 py-4 font-semibold">Name</th>
                   <th className="px-6 py-4 font-semibold text-center">Present</th>
                   <th className="px-6 py-4 font-semibold text-center">Absent</th>
                   <th className="px-6 py-4 font-semibold text-center">Avg %</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-white/5">
                 {attendanceRecords.map((rec, idx) => (
                   <tr key={rec.regNo} className="hover:bg-white/[0.02] transition-colors">
                     <td className="px-6 py-4 text-slate-500">{idx + 1}</td>
                     <td className="px-6 py-4 font-medium text-slate-300">{rec.regNo}</td>
                     <td className="px-6 py-4">
                       <div>
                         <p className="font-bold text-white">{rec.name}</p>
                         <p className="text-xs text-slate-500">{rec.email}</p>
                       </div>
                     </td>
                     <td className="px-6 py-4 text-center">
                        <span className="inline-flex px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded-md font-bold">
                           {rec.present}
                        </span>
                     </td>
                     <td className="px-6 py-4 text-center">
                        <span className="inline-flex px-2 py-1 bg-rose-500/10 text-rose-400 rounded-md font-bold">
                           {rec.absent}
                        </span>
                     </td>
                     <td className="px-6 py-4 text-center">
                        <span className={`font-black ${rec.avg >= 75 ? 'text-emerald-500' : rec.avg >= 50 ? 'text-amber-500' : 'text-rose-500'}`}>
                           {rec.avg}%
                        </span>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        )}
      </div>

    </motion.div>
  );
}
