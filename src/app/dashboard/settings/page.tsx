"use client";

import { useState, useEffect } from "react";
import { 
  User, Lock, Bell, Monitor, ChevronRight, Plus, Trash2, Shield, Layers, BookOpen, GraduationCap, Globe, Settings as SettingsIcon, Mail, Fingerprint, Database, Cpu, Check, Edit2, X, Hash, Loader2, MapPin
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { auth, db } from "@/lib/firebase";
import { sendPasswordResetEmail } from "firebase/auth";
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import SectionManagerModal from "./SectionManagerModal";

export default function SettingsPage() {
  const { userData } = useAuth();
  const [branches, setBranches] = useState<any[]>([]);
  const [semesters, setSemesters] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [batchMappings, setBatchMappings] = useState<any[]>([]);
  const [allowedCoordinates, setAllowedCoordinates] = useState<any[]>([]);
  
  const [newBranch, setNewBranch] = useState("");
  const [newSem, setNewSem] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [newSubjectBranch, setNewSubjectBranch] = useState("");
  const [newMapping, setNewMapping] = useState({ prefix: "", branch: "", semester: "", passoutYear: "" });
  const [editingData, setEditingData] = useState<Record<string, { branch: string, semester: string, passoutYear: string }>>({});
  const [editingSubject, setEditingSubject] = useState<any>(null);
  const [selectedBatchForSections, setSelectedBatchForSections] = useState<any | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    if (userData?.role !== 'admin') return;

    const bQuery = query(collection(db, "branches"), orderBy("name"));
    const sQuery = query(collection(db, "semesters"), orderBy("name"));
    const subQuery = query(collection(db, "subjects"), orderBy("name"));
    const mQuery = query(collection(db, "batchMappings"));
    const cQuery = query(collection(db, "allowedCoordinates"));

    const unsubB = onSnapshot(bQuery, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setBranches(data);
    });

    const unsubS = onSnapshot(sQuery, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setSemesters(data);
    });

    const unsubSub = onSnapshot(subQuery, (snap) => {
      setSubjects(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubM = onSnapshot(mQuery, (snap) => {
      setBatchMappings(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubC = onSnapshot(cQuery, (snap) => {
      setAllowedCoordinates(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubB(); unsubS(); unsubSub(); unsubM(); unsubC();
    };
  }, [userData]);

  const handleAdd = async (col: string, val: string, setter: Function) => {
    if (!val.trim()) return;
    await addDoc(collection(db, col), { name: val.trim() });
    setter("");
  };

  const handleAddMapping = async (e: React.FormEvent) => {
    e.preventDefault(); if (!newMapping.prefix.trim()) return;
    await addDoc(collection(db, "batchMappings"), newMapping);
    setNewMapping({ ...newMapping, prefix: "", passoutYear: "" });
  };

  const handleUpdateMapping = async (id: string, branch: string, semester: string, passoutYear: string) => {
    await updateDoc(doc(db, "batchMappings", id), { branch, semester, passoutYear: passoutYear || "" });
  };

  const handleDelete = async (col: string, id: string) => {
    if (confirm(`Delete Record?`)) await deleteDoc(doc(db, col, id));
  };

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim() || !newSubjectBranch) return;
    await addDoc(collection(db, "subjects"), { 
      name: newSubject.trim(), 
      branch: newSubjectBranch 
    });
    setNewSubject("");
  };

  const handleUpdateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubject?.id) return;
    await updateDoc(doc(db, "subjects", editingSubject.id), {
      name: editingSubject.name,
      branch: editingSubject.branch
    });
    setEditingSubject(null);
  };

  const handleAddCoordinate = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const name = prompt("Enter a name for this location (e.g. Room 13):");
          if (!name) return;
          await addDoc(collection(db, "allowedCoordinates"), {
            name: name,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            createdAt: new Date()
          });
          alert("Location added successfully!");
        },
        (err) => alert("Failed to get location: " + err.message)
      );
    } else {
      alert("Geolocation is not supported by this browser.");
    }
  };

  const parseCoordinates = (input: string) => {
    try {
      // DMS format like "20°09'40.2"N 85°52'56.0"E"
      const dmsRegex = /(\d+)[^0-9nsew]+(\d+)[^0-9nsew]+([\d.]+)[^0-9nsew]*([NS])[^0-9nsew]*(\d+)[^0-9nsew]+(\d+)[^0-9nsew]+([\d.]+)[^0-9nsew]*([EW])/i;
      const dmsMatch = input.match(dmsRegex);
      if (dmsMatch) {
        let lat = parseInt(dmsMatch[1]) + parseInt(dmsMatch[2]) / 60 + parseFloat(dmsMatch[3]) / 3600;
        if (dmsMatch[4].toUpperCase() === 'S') lat = -lat;
        
        let lng = parseInt(dmsMatch[5]) + parseInt(dmsMatch[6]) / 60 + parseFloat(dmsMatch[7]) / 3600;
        if (dmsMatch[8].toUpperCase() === 'W') lng = -lng;

        return { lat, lng };
      }

      // Decimal format like "20.123, 85.123" or "20.123 N 85.123 E"
      const cleanInput = input.replace(/[NSEWnsew]/g, '');
      const decimalMatch = cleanInput.match(/(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/);
      if (decimalMatch) {
        return { lat: parseFloat(decimalMatch[1]), lng: parseFloat(decimalMatch[2]) };
      }
    } catch(e) {}
    return null;
  };

  const handleManualCoordinateAdd = async () => {
    const coordStr = prompt("Paste coordinates (e.g., 20°09'40.2\"N 85°52'56.0\"E OR 20.161, 85.882):");
    if (!coordStr) return;
    
    const parsed = parseCoordinates(coordStr);
    if (!parsed) {
      alert("Invalid coordinate format. Please use DMS or Decimal format.");
      return;
    }

    const name = prompt("Enter a name for this location (e.g. Room 13):");
    if (!name) return;

    await addDoc(collection(db, "allowedCoordinates"), {
      name: name,
      lat: parsed.lat,
      lng: parsed.lng,
      createdAt: new Date()
    });
    alert("Location manually added successfully!");
  };

  const handleRecalibrateCoordinate = (id: string, name: string) => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if(confirm(`Recalibrate location for ${name} to current position?`)) {
            await updateDoc(doc(db, "allowedCoordinates", id), {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              updatedAt: new Date()
            });
            alert("Location recalibrated successfully!");
          }
        },
        (err) => alert("Failed to get location: " + err.message)
      );
    }
  };

  const handlePasswordReset = async () => {
    if (!userData?.email) return;
    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, userData.email);
      setResetSent(true);
      setTimeout(() => setResetSent(false), 5000);
    } catch (error: any) {
      alert("Security Protocol Error: " + error.message);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-[1600px] mx-auto w-full px-4 lg:px-10 space-y-12 animate-in fade-in duration-700 pb-20"
    >
      <div className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-blue-600/20 to-indigo-600/20 rounded-lg blur-xl opacity-50"></div>
        <div className="relative grid grid-cols-1 lg:grid-cols-4 gap-6 items-stretch">
          <div className="lg:col-span-3 bg-slate-900/40 border border-white/5 rounded-lg p-4 sm:p-6 flex items-center justify-between backdrop-blur-3xl shadow-2xl overflow-hidden">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 relative z-10 w-full text-center sm:text-left">
               <div className="w-16 h-16 sm:w-24 sm:h-24 shrink-0 rounded-lg bg-slate-950 border border-white/10 flex items-center justify-center text-2xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-500 shadow-2xl relative">
                     {userData?.name?.charAt(0)}
               </div>
               <div className="flex flex-col items-center sm:items-start w-full min-w-0">
                  <h3 className="text-xl sm:text-3xl font-black text-white tracking-tighter mb-1.5 sm:mb-3 italic truncate w-full">{userData?.name}</h3>
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:gap-4 w-full">
                     <span className="px-3 sm:px-4 py-1 sm:py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full text-[9px] sm:text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] sm:tracking-[0.3em] shadow-[0_0_20px_rgba(59,130,246,0.1)]">{userData?.role}</span>
                     <p className="text-[9px] sm:text-xs text-slate-500 font-bold tracking-tight uppercase opacity-60 truncate">{userData?.email}</p>
                  </div>
               </div>
            </div>
          </div>
          <div className="relative overflow-hidden bg-slate-900/40 border border-white/5 rounded-lg p-4 sm:p-6 flex flex-col justify-center backdrop-blur-3xl shadow-2xl items-center sm:items-start text-center sm:text-left">
            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-5 mb-0">
              <div className="p-3 sm:p-4 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 shadow-2xl"><Shield className="w-5 h-5 sm:w-6 sm:h-6"/></div>
              <div>
                <p className="text-[8px] sm:text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] sm:tracking-[0.3em] mb-0.5 sm:mb-1">Access Tier</p>
                <p className="text-sm sm:text-lg font-black text-white uppercase italic tracking-tighter">{userData?.role === 'admin' ? "System Admin" : "Verified"}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {userData?.role === 'admin' ? (
        <div className="space-y-12">
          {/* Academic Infrastructure - Reverted to Grid as requested */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            {/* Branch Registry */}
            <div className="bg-slate-900/40 border border-white/5 rounded-lg p-4 lg:p-6 backdrop-blur-3xl shadow-2xl flex flex-col h-full">
              <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
                <div className="p-3 sm:p-4 bg-blue-600/20 rounded-lg border border-blue-500/30">
                  <Layers className="text-blue-400 w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-[0.2em] sm:tracking-[0.3em] italic">Branch</h3>
                  <p className="text-[8px] sm:text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5 sm:mt-1 opacity-60 italic">Registry</p>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto max-h-[300px] no-scrollbar mb-6 sm:mb-8">
                {branches.map(b => (
                  <div key={b.id} className="flex items-center justify-between p-3 sm:p-4 bg-slate-950/60 rounded-lg border border-white/5 group/row hover:border-blue-500/30 transition-all gap-2">
                    <span className="text-[9px] sm:text-[10px] font-black text-slate-300 uppercase tracking-widest truncate">{b.name}</span>
                    <button onClick={() => handleDelete('branches', b.id)} className="p-2 text-rose-500 bg-rose-500/10 hover:bg-rose-500 hover:text-white rounded-lg transition-all">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 sm:gap-3 p-1.5 sm:p-2 bg-slate-950 rounded-lg border border-white/5 shadow-inner mt-auto">
                <input 
                  type="text" placeholder="NEW BRANCH..."
                  value={newBranch} onChange={e => setNewBranch(e.target.value.toUpperCase())}
                  className="flex-1 min-w-0 bg-transparent px-3 py-2 sm:px-4 sm:py-3 text-[9px] sm:text-[10px] font-black text-white outline-none placeholder:text-slate-800 tracking-widest sm:tracking-[0.2em]"
                />
                <button 
                  onClick={() => handleAdd('branches', newBranch, setNewBranch)}
                  className="px-4 sm:px-6 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all font-black text-[8px] sm:text-[9px] uppercase tracking-widest italic whitespace-nowrap"
                >
                  Form
                </button>
              </div>
            </div>

            {/* Sem Registry */}
            <div className="bg-slate-900/40 border border-white/5 rounded-lg p-4 lg:p-6 backdrop-blur-3xl shadow-2xl flex flex-col h-full">
              <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
                <div className="p-3 sm:p-4 bg-indigo-600/20 rounded-lg border border-indigo-500/30">
                  <GraduationCap className="text-indigo-400 w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-[0.2em] sm:tracking-[0.3em] italic">Sem</h3>
                  <p className="text-[8px] sm:text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5 sm:mt-1 opacity-60 italic">Registry</p>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto max-h-[300px] no-scrollbar mb-6 sm:mb-8">
                {semesters.map(s => (
                  <div key={s.id} className="flex items-center justify-between p-3 sm:p-4 bg-slate-950/60 rounded-lg border border-white/5 group/row hover:border-indigo-500/30 transition-all gap-2">
                    <span className="text-[9px] sm:text-[10px] font-black text-slate-300 uppercase tracking-widest truncate">{s.name}</span>
                    <button onClick={() => handleDelete('semesters', s.id)} className="p-2 text-rose-500 bg-rose-500/10 hover:bg-rose-500 hover:text-white rounded-lg transition-all">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 sm:gap-3 p-1.5 sm:p-2 bg-slate-950 rounded-lg border border-white/5 shadow-inner mt-auto">
                <input 
                  type="text" placeholder="NEW ENTRY (E.G. 1)..."
                  value={newSem} onChange={e => setNewSem(e.target.value.toUpperCase())}
                  className="flex-1 min-w-0 bg-transparent px-3 py-2 sm:px-4 sm:py-3 text-[9px] sm:text-[10px] font-black text-white outline-none placeholder:text-slate-800 tracking-widest sm:tracking-[0.2em]"
                />
                <button 
                  onClick={() => handleAdd('semesters', newSem, setNewSem)}
                  className="px-4 sm:px-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all font-black text-[8px] sm:text-[9px] uppercase tracking-widest italic whitespace-nowrap"
                >
                  Form
                </button>
              </div>
            </div>

            {/* Subject Registry */}
            <div className="bg-slate-900/40 border border-white/5 rounded-lg p-4 lg:p-6 backdrop-blur-3xl shadow-2xl flex flex-col h-full">
              <div className="flex items-center justify-between mb-6 sm:mb-8">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="p-3 sm:p-4 bg-emerald-600/20 rounded-lg border border-emerald-500/30">
                    <BookOpen className="text-emerald-400 w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-[0.2em] sm:tracking-[0.3em] italic">Subject</h3>
                    <p className="text-[8px] sm:text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5 sm:mt-1 opacity-60 italic">Registry</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-1.5 bg-slate-950/80 p-1.5 rounded-lg border border-white/5 mb-4 sm:mb-6 overflow-x-auto no-scrollbar">
                {branches.map(b => (
                  <button 
                    key={b.id}
                    onClick={() => setNewSubjectBranch(b.name)}
                    className={`px-3 sm:px-4 py-2 rounded-lg text-[7px] sm:text-[8px] font-black uppercase tracking-widest border transition-all whitespace-nowrap ${newSubjectBranch === b.name ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'border-transparent text-slate-600'}`}
                  >
                    {b.name}
                  </button>
                ))}
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto max-h-[220px] no-scrollbar mb-6 sm:mb-8">
                {subjects.filter(s => s.branch === newSubjectBranch).map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3 sm:p-4 bg-slate-950/60 rounded-lg border border-white/5 group/row hover:border-emerald-500/30 transition-all gap-2">
                    <span className="text-[9px] sm:text-[10px] font-black text-slate-300 uppercase tracking-widest truncate">{s.name}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditingSubject(s)} className="p-2 text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500 hover:text-white rounded-lg transition-all">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDelete('subjects', s.id)} className="p-2 text-rose-500 bg-rose-500/10 hover:bg-rose-500 hover:text-white rounded-lg transition-all">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {subjects.filter(s => s.branch === newSubjectBranch).length === 0 && (
                  <div className="h-32 flex items-center justify-center opacity-20 text-[8px] sm:text-[9px] font-black uppercase tracking-[0.2em] sm:tracking-[0.3em] italic text-center">
                    Select Branch
                  </div>
                )}
              </div>

              <form onSubmit={handleAddSubject} className="flex gap-2 sm:gap-3 p-1.5 sm:p-2 bg-slate-950 rounded-lg border border-white/5 shadow-inner mt-auto">
                <input 
                  type="text" placeholder="NEW SUBJECT..."
                  value={newSubject} onChange={e => setNewSubject(e.target.value.toUpperCase())}
                  className="flex-1 min-w-0 bg-transparent px-3 py-2 sm:px-4 sm:py-3 text-[9px] sm:text-[10px] font-black text-white outline-none placeholder:text-slate-800 tracking-widest sm:tracking-[0.2em]"
                />
                <button 
                  type="submit"
                  disabled={!newSubjectBranch}
                  className="px-4 sm:px-6 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-20 text-white rounded-lg transition-all font-black text-[8px] sm:text-[9px] uppercase tracking-widest italic whitespace-nowrap"
                >
                  Form
                </button>
              </form>
            </div>
          </div>

            {/* Classroom Locations Ledger */}
            <div className="bg-slate-900/40 border border-white/5 rounded-lg p-6 backdrop-blur-3xl shadow-2xl relative overflow-hidden mb-6">
               <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 mb-8 text-center sm:text-left">
                  <div className="p-4 sm:p-5 bg-teal-600/20 rounded-lg border border-teal-500/30 shadow-[0_0_30px_rgba(20,184,166,0.3)]">
                    <MapPin className="text-teal-400" size={28} />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-base sm:text-lg font-black text-white uppercase tracking-[0.5em] italic">Geofence Nodes</h4>
                    <p className="text-[9px] sm:text-[10px] text-slate-500 font-black uppercase tracking-[0.4em] mt-1.5 sm:mt-2 italic opacity-60">Allowed Coordinates for Smartboard</p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 w-full sm:w-auto mt-4 sm:mt-0">
                     <button 
                        onClick={handleManualCoordinateAdd}
                        className="w-full sm:w-auto px-6 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-white rounded-lg transition-all font-black text-[10px] uppercase tracking-widest flex justify-center items-center gap-2 shadow-lg whitespace-nowrap"
                     >
                        <Edit2 size={16} /> Manual Input
                     </button>
                     <button 
                        onClick={handleAddCoordinate}
                        className="w-full sm:w-auto px-6 py-3 bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-all font-black text-[10px] uppercase tracking-widest flex justify-center items-center gap-2 shadow-[0_10px_20px_-10px_rgba(20,184,166,0.5)] whitespace-nowrap"
                     >
                        <MapPin size={16} /> GPS Detect
                     </button>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {allowedCoordinates.map(coord => (
                     <div key={coord.id} className="bg-slate-950/60 border border-white/5 rounded-lg p-4 flex flex-col justify-between group hover:border-teal-500/30 transition-all">
                        <div className="mb-4">
                           <h5 className="text-xs font-black text-white uppercase tracking-widest">{coord.name}</h5>
                           <p className="text-[9px] text-slate-500 font-mono mt-1">{coord.lat?.toFixed(6)}, {coord.lng?.toFixed(6)}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-auto">
                           <button 
                              onClick={() => handleRecalibrateCoordinate(coord.id, coord.name)}
                              className="flex-1 py-2 bg-teal-500/10 text-teal-400 hover:bg-teal-500 hover:text-white rounded-lg text-[8px] font-black uppercase tracking-widest transition-all"
                           >
                              Recalibrate
                           </button>
                           <button 
                              onClick={() => handleDelete('allowedCoordinates', coord.id)}
                              className="p-2 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-lg transition-all"
                           >
                              <Trash2 size={14} />
                           </button>
                        </div>
                     </div>
                  ))}
                  {allowedCoordinates.length === 0 && (
                     <div className="col-span-full h-24 flex items-center justify-center border border-dashed border-white/10 rounded-lg">
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">No geofence nodes configured</p>
                     </div>
                  )}
               </div>
            </div>

            {/* Batch Synchronization Ledger */}
            <div className="bg-slate-900/40 border border-white/5 rounded-lg p-6 backdrop-blur-3xl shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent"></div>
              <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 mb-8 sm:mb-12 text-center sm:text-left">
                  <div className="p-4 sm:p-5 bg-indigo-600/20 rounded-lg border border-indigo-500/30 shadow-[0_0_30px_rgba(79,70,229,0.3)]">
                    <Globe className="text-indigo-400" size={28} />
                  </div>
                  <div>
                    <h4 className="text-base sm:text-lg font-black text-white uppercase tracking-[0.5em] italic">Batch Mapping</h4>
                    <p className="text-[9px] sm:text-[10px] text-slate-500 font-black uppercase tracking-[0.4em] mt-1.5 sm:mt-2 italic opacity-60">Synchronize Branch & Sem</p>
                  </div>
              </div>

              <form onSubmit={handleAddMapping} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 md:gap-6 bg-slate-950/60 p-4 md:p-6 rounded-lg border border-white/5 shadow-inner mb-12">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] ml-2">Batch</label>
                    <input 
                      type="text" placeholder="F2302..."
                      value={newMapping.prefix} 
                      onChange={e => setNewMapping({...newMapping, prefix: e.target.value.toUpperCase()})}
                      className="w-full bg-slate-950 border border-white/10 rounded-lg px-5 py-4 text-sm font-mono font-black text-blue-400 outline-none focus:border-indigo-500/50 transition-all shadow-2xl placeholder:text-slate-800 tracking-[0.3em]"
                    />
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] ml-2">Branch</label>
                    <select 
                      value={newMapping.branch}
                      onChange={e => setNewMapping({...newMapping, branch: e.target.value})}
                      className="w-full bg-slate-950 border border-white/10 rounded-lg px-5 py-4 text-xs font-black text-white outline-none focus:border-indigo-500/50 transition-all shadow-2xl appearance-none cursor-pointer tracking-widest"
                    >
                        <option value="">Select Branch</option>
                        {branches.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] ml-2">Sem</label>
                    <select 
                      value={newMapping.semester}
                      onChange={e => setNewMapping({...newMapping, semester: e.target.value})}
                      className="w-full bg-slate-950 border border-white/10 rounded-lg px-5 py-4 text-xs font-black text-indigo-400 outline-none focus:border-indigo-500/50 transition-all shadow-2xl appearance-none cursor-pointer tracking-widest"
                    >
                        <option value="">Select Sem</option>
                        {semesters.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                        <option value="Passout">Passout</option>
                    </select>
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] ml-2">Passout Year</label>
                    <input 
                      type="text" placeholder="e.g. 2027"
                      value={newMapping.passoutYear} 
                      onChange={e => setNewMapping({...newMapping, passoutYear: e.target.value})}
                      disabled={newMapping.semester !== 'Passout'}
                      className="w-full bg-slate-950 border border-white/10 rounded-lg px-5 py-4 text-sm font-mono font-black text-amber-400 outline-none focus:border-amber-500/50 transition-all shadow-2xl placeholder:text-slate-800 tracking-[0.3em] disabled:opacity-50"
                    />
                  </div>
                  <button type="submit" className="relative group/btn bg-white text-slate-950 hover:bg-indigo-600 hover:text-white font-black text-[11px] uppercase tracking-[0.3em] py-4 rounded-lg mt-auto shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)] transition-all duration-700 active:scale-95 overflow-hidden">
                    <span className="relative z-10 flex items-center justify-center gap-3 italic">
                        Execute Link <ChevronRight size={16} />
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-blue-600 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-700"></div>
                  </button>
              </form>

              <div className="rounded-lg border border-white/5 overflow-hidden bg-slate-950/60 backdrop-blur-2xl shadow-inner">
                  <div className="overflow-x-auto no-scrollbar">
                    {/* Mobile Card View */}
                    <div className="block md:hidden divide-y divide-white/5">
                      {batchMappings.map(m => {
                          const currentData = editingData[m.id] || { branch: m.branch, semester: m.semester, passoutYear: m.passoutYear || "" };
                          const hasChanges = editingData[m.id] && (editingData[m.id].branch !== m.branch || editingData[m.id].semester !== m.semester || editingData[m.id].passoutYear !== (m.passoutYear || ""));

                          return (
                            <div key={m.id} className="p-4 hover:bg-white/[0.03] transition-all space-y-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_15px_rgba(59,130,246,1)]"></div>
                                        <span className="text-sm font-mono text-blue-400 font-black tracking-[0.3em] uppercase italic">{m.prefix}</span>
                                        {m.semester === 'Passout' && m.passoutYear && (
                                          <span className="ml-2 px-2 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-[9px] font-black tracking-widest uppercase">
                                            {m.passoutYear}
                                          </span>
                                        )}
                                    </div>
                                    {m.sections && m.sections.length > 0 && (
                                      <div className="flex flex-col gap-2 pl-5 mt-2">
                                        {m.sections.map((sec: any) => (
                                          <div key={sec.id} className="flex flex-col gap-1.5">
                                            <span className="w-fit px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[9px] font-black uppercase tracking-wider shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                                              {sec.name}
                                            </span>
                                            {sec.groups && sec.groups.length > 0 && (
                                              <div className="flex flex-wrap gap-1.5 pl-3 border-l border-white/5 ml-2">
                                                {sec.groups.map((grp: any) => (
                                                  <span key={grp.id} className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded text-[8px] font-black uppercase tracking-wider shadow-sm">
                                                    {grp.name}
                                                  </span>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                      <button 
                                        onClick={() => setSelectedBatchForSections(m)} 
                                        className="p-2 text-blue-400 hover:text-white bg-blue-500/10 hover:bg-blue-500 rounded-lg transition-all border border-transparent shrink-0"
                                      >
                                          <Edit2 size={16} />
                                      </button>
                                      {hasChanges && (
                                        <button 
                                          onClick={() => handleUpdateMapping(m.id, currentData.branch, currentData.semester, currentData.passoutYear)}
                                          className="p-2 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg transition-all animate-pulse hover:bg-emerald-500 hover:text-white shadow-lg shrink-0"
                                        >
                                          <Check size={16} />
                                        </button>
                                      )}
                                      <button 
                                        onClick={() => handleDelete('batchMappings', m.id)} 
                                        className="p-2 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all border border-transparent hover:border-rose-500/30 shrink-0"
                                      >
                                          <Trash2 size={16} />
                                      </button>
                                  </div>
                                </div>
                                <div className="flex gap-3 bg-slate-900/50 p-3 rounded-lg border border-white/5">
                                  <div className="flex-1 space-y-1">
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em]">Branch</label>
                                    <select 
                                      value={currentData.branch}
                                      onChange={e => setEditingData({ ...editingData, [m.id]: { ...currentData, branch: e.target.value } })}
                                      className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-2 py-1.5 text-[10px] font-black text-slate-300 tracking-widest uppercase outline-none focus:border-indigo-500/50 transition-all appearance-none cursor-pointer text-center shadow-sm"
                                    >
                                        {branches.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                                    </select>
                                  </div>
                                  <div className="flex-1 space-y-1">
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center justify-between">
                                      Sem
                                      {currentData.semester === 'Passout' && currentData.passoutYear && (
                                        <button 
                                          onClick={() => {
                                            const inputYear = prompt("Edit Passout Year:", currentData.passoutYear);
                                            if (inputYear) setEditingData({ ...editingData, [m.id]: { ...currentData, passoutYear: inputYear } });
                                          }}
                                          className="text-amber-400 hover:text-amber-300"
                                        >
                                          <Edit2 size={10} />
                                        </button>
                                      )}
                                    </label>
                                    <select 
                                      value={currentData.semester}
                                      onChange={e => {
                                        const val = e.target.value;
                                        let year = currentData.passoutYear;
                                        if (val === 'Passout') {
                                          const inputYear = prompt("Enter Passout Year (e.g. 2027):", year || "");
                                          if (inputYear) year = inputYear;
                                        }
                                        setEditingData({ ...editingData, [m.id]: { ...currentData, semester: val, passoutYear: year } });
                                      }}
                                      className="w-full bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-2 py-1.5 text-[10px] font-black text-indigo-400 tracking-widest uppercase outline-none focus:border-indigo-500/50 transition-all appearance-none cursor-pointer text-center shadow-[0_0_10px_rgba(99,102,241,0.1)]"
                                    >
                                        {semesters.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                        <option value="Passout">Passout</option>
                                    </select>
                                  </div>
                                </div>
                            </div>
                          );
                      })}
                    </div>

                    {/* Desktop Table View */}
                    <table className="hidden md:table w-full text-left whitespace-nowrap">
                        <thead className="bg-slate-950/90 border-b border-white/5">
                          <tr>
                              <th className="px-6 py-5 text-[11px] font-black text-slate-500 uppercase tracking-[0.5em] italic">Batch</th>
                              <th className="px-6 py-5 text-[11px] font-black text-slate-500 uppercase tracking-[0.5em] italic">Branch</th>
                              <th className="px-6 py-5 text-[11px] font-black text-slate-500 uppercase tracking-[0.5em] italic">Sem</th>
                              <th className="px-6 py-5 text-[11px] font-black text-slate-500 uppercase tracking-[0.5em] italic text-right">Control</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {batchMappings.map(m => {
                              const currentData = editingData[m.id] || { branch: m.branch, semester: m.semester, passoutYear: m.passoutYear || "" };
                              const hasChanges = editingData[m.id] && (editingData[m.id].branch !== m.branch || editingData[m.id].semester !== m.semester || editingData[m.id].passoutYear !== (m.passoutYear || ""));

                              return (
                                <tr key={m.id} className="hover:bg-white/[0.03] transition-all group/row">
                                    <td className="px-6 py-5">
                                      <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-4">
                                            <div className="w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_15px_rgba(59,130,246,1)] group-hover/row:scale-125 transition-transform"></div>
                                            <span className="text-sm font-mono text-blue-400 font-black tracking-[0.3em] uppercase italic">{m.prefix}</span>
                                            {m.semester === 'Passout' && m.passoutYear && (
                                              <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-[10px] font-black tracking-widest uppercase shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                                                {m.passoutYear}
                                              </span>
                                            )}
                                        </div>
                                        {m.sections && m.sections.length > 0 && (
                                          <div className="flex flex-col gap-2 pl-6 mt-2">
                                            {m.sections.map((sec: any) => (
                                              <div key={sec.id} className="flex flex-col gap-1.5">
                                                <span className="w-fit px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[9px] font-black uppercase tracking-wider shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                                                  {sec.name}
                                                </span>
                                                {sec.groups && sec.groups.length > 0 && (
                                                  <div className="flex flex-wrap gap-1.5 pl-3 border-l border-white/5 ml-2">
                                                    {sec.groups.map((grp: any) => (
                                                      <span key={grp.id} className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded text-[8px] font-black uppercase tracking-wider shadow-sm">
                                                        {grp.name}
                                                      </span>
                                                    ))}
                                                  </div>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-6 py-5">
                                      <select 
                                        value={currentData.branch}
                                        onChange={e => setEditingData({ ...editingData, [m.id]: { ...currentData, branch: e.target.value } })}
                                        className="bg-slate-800/80 border border-slate-700 rounded px-3 py-1.5 text-[10px] font-black tracking-widest uppercase text-slate-300 outline-none focus:border-indigo-500/50 transition-all appearance-none cursor-pointer hover:bg-slate-700/80 text-center shadow-sm"
                                      >
                                          {branches.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                                      </select>
                                    </td>
                                    <td className="px-6 py-5">
                                      <div className="flex items-center gap-2">
                                        <select 
                                          value={currentData.semester}
                                          onChange={e => {
                                            const val = e.target.value;
                                            let year = currentData.passoutYear;
                                            if (val === 'Passout') {
                                              const inputYear = prompt("Enter Passout Year (e.g. 2027):", year || "");
                                              if (inputYear) year = inputYear;
                                            }
                                            setEditingData({ ...editingData, [m.id]: { ...currentData, semester: val, passoutYear: year } });
                                          }}
                                          className="bg-indigo-500/10 border border-indigo-500/20 rounded px-3 py-1.5 text-[10px] font-black tracking-widest uppercase text-indigo-400 outline-none focus:border-indigo-500/50 transition-all appearance-none cursor-pointer hover:bg-indigo-500/20 text-center shadow-[0_0_10px_rgba(99,102,241,0.1)]"
                                        >
                                            {semesters.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                            <option value="Passout">Passout</option>
                                        </select>
                                        {currentData.semester === 'Passout' && currentData.passoutYear && (
                                          <button 
                                            onClick={() => {
                                              const inputYear = prompt("Edit Passout Year:", currentData.passoutYear);
                                              if (inputYear) setEditingData({ ...editingData, [m.id]: { ...currentData, passoutYear: inputYear } });
                                            }}
                                            className="p-1.5 text-amber-400/50 hover:text-amber-400 transition-colors"
                                            title="Edit Passout Year"
                                          >
                                            <Edit2 size={12} />
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-6 py-5 text-right">
                                      <div className="flex items-center justify-end gap-3">
                                          <button 
                                            onClick={() => setSelectedBatchForSections(m)} 
                                            className="p-2.5 text-blue-400 bg-blue-500/10 hover:bg-blue-500 hover:text-white border border-transparent rounded-lg transition-all shadow-lg"
                                          >
                                              <Edit2 size={16} />
                                          </button>
                                          {hasChanges && (
                                            <button 
                                              onClick={() => handleUpdateMapping(m.id, currentData.branch, currentData.semester, currentData.passoutYear)}
                                              className="p-2.5 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg transition-all animate-pulse hover:bg-emerald-500 hover:text-white shadow-lg"
                                            >
                                              <Check size={16} />
                                            </button>
                                          )}
                                          <button onClick={() => handleDelete('batchMappings', m.id)} className="p-2.5 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all border border-transparent hover:border-rose-500/30">
                                              <Trash2 size={16} />
                                          </button>
                                      </div>
                                    </td>
                                </tr>
                              );
                          })}
                        </tbody>
                    </table>
                  </div>
              </div>
            </div>

            {/* Bottom Controls Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-slate-900/40 border border-white/5 rounded-lg p-6 backdrop-blur-3xl shadow-2xl relative overflow-hidden group/controls">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-[100px] pointer-events-none"></div>
                  <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 mb-8 sm:mb-10 text-center sm:text-left">
                      <div className="p-4 sm:p-5 bg-amber-500/20 rounded-lg border border-amber-500/30 shadow-[0_0_30px_rgba(245,158,11,0.2)] group-hover/controls:rotate-6 transition-transform">
                        <Cpu className="text-amber-400" size={28} />
                      </div>
                      <div>
                        <h4 className="text-base sm:text-lg font-black text-white uppercase tracking-[0.5em] italic">System Controls</h4>
                        <p className="text-[9px] sm:text-[10px] text-slate-500 font-black uppercase tracking-[0.4em] mt-1.5 sm:mt-2 italic opacity-60">Administrative Tools</p>
                      </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {[
                        { name: "Room Auth", desc: "Room Security Protocol", icon: Lock, color: "text-amber-400", bg: "bg-amber-400/5", border: "border-amber-400/20" },
                        { name: "Broadcasts", desc: "System-wide Alerts", icon: Bell, color: "text-rose-400", bg: "bg-rose-400/5", border: "border-rose-400/20" },
                        { name: "Hardware", desc: "Room Sync Link", icon: Monitor, color: "text-indigo-400", bg: "bg-indigo-400/5", border: "border-indigo-400/20" },
                        { name: "Backups", desc: "Cloud Database Mirror", icon: Database, color: "text-blue-400", bg: "bg-blue-400/5", border: "border-blue-400/20" }
                      ].map((item, i) => (
                        <button key={i} className={`w-full flex items-center justify-between p-4 md:p-5 ${item.bg} border ${item.border} rounded-lg hover:bg-slate-900/80 transition-all duration-500 group/btn relative overflow-hidden shadow-xl`}>
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent -translate-x-full group-hover/btn:translate-x-full transition-transform duration-1000"></div>
                          <div className="flex items-center gap-6 relative z-10">
                              <div className={`p-4 bg-slate-950 rounded-lg border border-white/5 shadow-2xl transition-all duration-500 ${item.color} group-hover/btn:scale-110 group-hover/btn:rotate-3`}><item.icon size={22} /></div>
                              <div className="text-left">
                                <p className="text-sm font-black text-white uppercase tracking-[0.2em] italic mb-1">{item.name}</p>
                                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest italic opacity-60">{item.desc}</p>
                              </div>
                          </div>
                          <ChevronRight size={18} className="text-slate-700 group-hover/btn:text-white group-hover/btn:translate-x-2 transition-all relative z-10" />
                        </button>
                      ))}
                  </div>
                </div>

                <div className="lg:col-span-1 relative group h-full">
                  <div className="absolute -inset-2 bg-gradient-to-r from-blue-600/30 to-indigo-600/30 rounded-lg blur-2xl opacity-50"></div>
                  <div className="relative h-full p-6 bg-slate-950/80 border border-blue-500/20 rounded-lg backdrop-blur-3xl overflow-hidden flex flex-col justify-center shadow-2xl">
                      <div className="absolute top-0 right-0 p-4 md:p-6 opacity-[0.03] rotate-12">
                        <Shield size={160} className="text-blue-400" />
                      </div>
                      <h5 className="text-xs sm:text-sm font-black text-blue-400 uppercase tracking-[0.4em] mb-4 sm:mb-6 flex items-center justify-center sm:justify-start gap-3 sm:gap-4 text-center sm:text-left">
                        <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-blue-500 rounded-full animate-pulse shadow-[0_0_15px_rgba(59,130,246,1)]"></span>
                        Security Protocol
                      </h5>
                      <p className="text-[10px] sm:text-xs text-slate-400 font-bold leading-relaxed italic pr-0 sm:pr-8 tracking-wide opacity-80 text-center sm:text-left">
                        Deployment synchronization is active. All modifications to department nodes or ledger mappings are propagated to endpoint rooms in real-time. Extreme caution is mandated during active sessions.
                      </p>
                      <div className="mt-12 flex items-center gap-4">
                        <div className="w-12 h-1.5 bg-blue-500/20 rounded-full"></div>
                        <div className="w-6 h-1.5 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
                        <div className="w-12 h-1.5 bg-blue-500/20 rounded-full"></div>
                      </div>
                  </div>
                </div>
            </div>
        </div>
      ) : (
        /* STUDENT/TEACHER VIEW: PERSONAL SETTINGS ONLY */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
           <div className="lg:col-span-8 space-y-10">
              <div className="bg-slate-900/40 border border-white/5 rounded-lg p-6 backdrop-blur-2xl shadow-2xl">
                 <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5 mb-8 sm:mb-12 text-center sm:text-left">
                    <div className="p-3 sm:p-4 bg-blue-600/20 rounded-lg border border-blue-500/30">
                       <User className="text-blue-400" size={24} />
                    </div>
                    <div>
                       <h4 className="text-xs sm:text-sm font-black text-white uppercase tracking-[0.4em] italic">Identity Dossier</h4>
                       <p className="text-[9px] sm:text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1 sm:mt-1.5 italic opacity-60">Verified User Credentials</p>
                    </div>
                 </div>
                 
                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-6">
                       <div>
                          <p className="text-[9px] text-slate-600 font-black uppercase tracking-[0.4em] mb-3 ml-2 text-center sm:text-left">Assigned Name</p>
                          <div className="text-sm font-black text-white bg-slate-950/80 border border-white/5 p-4 sm:p-6 rounded-lg italic shadow-inner text-center sm:text-left break-all sm:break-normal">{userData?.name}</div>
                       </div>
                       <div>
                          <p className="text-[9px] text-slate-600 font-black uppercase tracking-[0.4em] mb-3 ml-2 text-center sm:text-left">Communication Link</p>
                          <div className="text-sm font-black text-white bg-slate-950/80 border border-white/5 p-4 sm:p-6 rounded-lg italic shadow-inner text-center sm:text-left break-all sm:break-normal">{userData?.email}</div>
                       </div>
                    </div>
                    <div className="space-y-6">
                       <div>
                          <p className="text-[9px] text-slate-600 font-black uppercase tracking-[0.4em] mb-3 ml-2 text-center sm:text-left">Batch Identifier</p>
                          <div className="text-sm font-mono font-black text-blue-400 bg-slate-950/80 border border-white/5 p-4 sm:p-6 rounded-lg shadow-inner tracking-[0.2em] text-center sm:text-left break-all sm:break-normal">{userData?.prefix || "UNASSIGNED"}</div>
                       </div>
                       <div>
                          <p className="text-[9px] text-slate-600 font-black uppercase tracking-[0.4em] mb-3 ml-2 text-center sm:text-left">Registry Number</p>
                          <div className="text-sm font-mono font-black text-slate-400 bg-slate-950/80 border border-white/5 p-4 sm:p-6 rounded-lg shadow-inner tracking-[0.2em] text-center sm:text-left break-all sm:break-normal">{userData?.regNo || "PENDING"}</div>
                       </div>
                    </div>
                 </div>
              </div>

              <div className="bg-slate-900/40 border border-white/5 rounded-lg p-6 backdrop-blur-2xl shadow-2xl">
                 <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5 mb-8 sm:mb-12 text-center sm:text-left">
                    <div className="p-3 sm:p-4 bg-rose-600/20 rounded-lg border border-rose-500/30">
                       <Fingerprint className="text-rose-400" size={24} />
                    </div>
                    <div>
                       <h4 className="text-xs sm:text-sm font-black text-white uppercase tracking-[0.4em] italic">Security Matrix</h4>
                       <p className="text-[9px] sm:text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1 sm:mt-1.5 italic opacity-60">Authentication & Privacy</p>
                    </div>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <button 
                        onClick={handlePasswordReset}
                        disabled={resetLoading || resetSent}
                        className="flex items-center justify-between p-4 md:p-5 bg-slate-950/60 border border-white/5 rounded-lg hover:bg-slate-900 transition-all duration-500 group relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                     >
                        <div className="flex items-center gap-6 relative z-10">
                           <div className={`p-4 bg-slate-900 rounded-lg border border-white/5 ${resetSent ? 'text-emerald-500 border-emerald-500/20' : 'text-rose-500'} shadow-xl group-hover:scale-110 transition-transform`}>
                              {resetLoading ? <Loader2 size={20} className="animate-spin" /> : resetSent ? <Check size={20} /> : <Lock size={20} />}
                           </div>
                           <div className="text-left">
                              <p className="text-xs font-black text-white uppercase tracking-[0.2em] italic mb-1">Change Password</p>
                              <p className={`text-[9px] font-black uppercase tracking-widest italic ${resetSent ? 'text-emerald-500' : 'text-slate-600'}`}>
                                 {resetSent ? "Reset Link Dispatched" : "Request Reset Protocol"}
                              </p>
                           </div>
                        </div>
                        {!resetSent && !resetLoading && <ChevronRight size={18} className="text-slate-700 group-hover:text-rose-500 group-hover:translate-x-2 transition-all" />}
                     </button>
                    <button className="flex items-center justify-between p-4 md:p-5 bg-slate-950/60 border border-white/5 rounded-lg hover:bg-slate-900 transition-all duration-500 group relative overflow-hidden">
                       <div className="flex items-center gap-6 relative z-10">
                          <div className="p-4 bg-slate-900 rounded-lg border border-white/5 text-blue-500 shadow-xl group-hover:scale-110 transition-transform"><Shield size={20} /></div>
                          <div className="text-left">
                             <p className="text-xs font-black text-white uppercase tracking-[0.2em] italic mb-1">Secure Sessions</p>
                             <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest italic">Activity Ledger</p>
                          </div>
                       </div>
                       <ChevronRight size={18} className="text-slate-700 group-hover:text-blue-500 group-hover:translate-x-2 transition-all" />
                    </button>
                 </div>
              </div>
           </div>

           <div className="lg:col-span-4 space-y-10">
              <div className="relative group">
                 <div className="absolute -inset-1 bg-gradient-to-br from-blue-600/20 to-indigo-700/20 rounded-lg blur-xl opacity-50"></div>
                 <div className="relative p-6 bg-slate-950/80 border border-blue-500/20 rounded-lg text-center backdrop-blur-3xl shadow-2xl flex flex-col justify-center min-h-[500px]">
                    <div className="w-28 h-28 bg-blue-600/10 rounded-full flex items-center justify-center mx-auto mb-10 border border-blue-500/20 shadow-inner relative">
                       <div className="absolute inset-0 bg-blue-500/5 blur-2xl rounded-full"></div>
                       <Monitor className="text-blue-500 relative z-10" size={44} />
                    </div>
                    <h5 className="text-sm font-black text-white uppercase tracking-[0.5em] mb-6 italic">Secure Room</h5>
                    <p className="text-[11px] text-slate-400 font-bold leading-relaxed mb-10 tracking-wide italic opacity-80">
                      Authorized session active. All academic metadata is synchronized via your department prefix identifier.
                    </p>
                    <div className="inline-flex items-center gap-4 px-8 py-3 bg-slate-950/80 border border-white/10 rounded-full mx-auto shadow-2xl">
                       <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,1)]"></div>
                       <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] italic">Encryption Stable</span>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}
      {/* Edit Subject Modal */}
      <AnimatePresence>
        {editingSubject && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingSubject(null)}
              className="absolute inset-0 bg-slate-950/90 backdrop-blur-2xl"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-lg p-6 shadow-[0_0_100px_rgba(0,0,0,0.8)] overflow-hidden"
            >
              {/* Modal Background Decor */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none"></div>

              <div className="flex items-center justify-between mb-12 relative z-10">
                <div className="flex items-center gap-6">
                   <div className="p-4 bg-emerald-500/20 rounded-lg border border-emerald-500/30">
                    <GraduationCap size={28} className="text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white uppercase tracking-[0.4em] italic leading-tight">Edit Subject</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-2 italic opacity-60">Updating Registry Record</p>
                  </div>
                </div>
                <button onClick={() => setEditingSubject(null)} className="p-3 hover:bg-slate-800 rounded-lg text-slate-600 hover:text-white transition-all border border-transparent hover:border-white/5">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleUpdateSubject} className="space-y-10 relative z-10">
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] ml-3">Subject</label>
                  <input 
                    type="text"
                    value={editingSubject.name}
                    onChange={e => setEditingSubject({...editingSubject, name: e.target.value.toUpperCase()})}
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-5 py-4 text-sm font-black text-white focus:outline-none focus:border-emerald-500/50 transition-all shadow-inner tracking-[0.2em]"
                  />
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] ml-3">Branch</label>
                  <select 
                    value={editingSubject.branch}
                    onChange={e => setEditingSubject({...editingSubject, branch: e.target.value})}
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-5 py-4 text-sm font-black text-white focus:outline-none focus:border-emerald-500/50 transition-all shadow-inner appearance-none cursor-pointer tracking-widest"
                  >
                    <option value="">Select Branch</option>
                    {branches.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                  </select>
                </div>

                <button 
                  type="submit"
                  className="w-full py-6 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] uppercase tracking-[0.4em] rounded-lg shadow-[0_20px_40px_-10px_rgba(16,185,129,0.3)] transition-all duration-500 active:scale-95 italic"
                >
                  Commit Modifications
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedBatchForSections && (
          <SectionManagerModal 
            batch={selectedBatchForSections}
            onClose={() => setSelectedBatchForSections(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
