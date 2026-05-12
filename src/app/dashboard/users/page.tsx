"use client";

import { useState, useEffect } from "react";
import { 
  UserPlus, 
  CheckCircle, 
  AlertCircle, 
  ShieldCheck, 
  GraduationCap, 
  BookOpen, 
  Layers, 
  Search, 
  Filter, 
  Trash2, 
  User as UserIcon,
  ChevronRight,
  X,
  Edit3,
  Mail,
  Fingerprint,
  Calendar,
  Save,
  ArrowLeft,
  ChevronLeft,
  Hash,
  RefreshCw
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { db } from "@/lib/firebase";
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  deleteDoc, 
  doc, 
  getDocs,
  updateDoc
} from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";

export default function ManageUsersPage() {
  const { userData } = useAuth();
  
  const [view, setView] = useState<'list' | 'profile'>('list');
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    regNo: "",
    role: "student",
    branch: ""
  });

  const [selectedPrefix, setSelectedPrefix] = useState("");
  const [regSuffix, setRegSuffix] = useState("");
  
  const [status, setStatus] = useState<{ type: "idle" | "loading" | "success" | "error"; message?: string }>({
    type: "idle",
  });

  const [users, setUsers] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [semesters, setSemesters] = useState<any[]>([]);
  
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editData, setEditData] = useState<any>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterBranch, setFilterBranch] = useState("all");
  const [filterSemester, setFilterSemester] = useState("all");

  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!userData) return;

    const unsubMappings = onSnapshot(collection(db, "batchMappings"), (snap) => {
      setMappings(snap.docs.map(doc => doc.data()));
    });

    const fetchConfigs = async () => {
      const bSnap = await getDocs(collection(db, "branches"));
      const sSnap = await getDocs(collection(db, "semesters"));
      const bList = bSnap.docs.map(doc => doc.data().name).sort();
      setBranches(bList);
      setSemesters(sSnap.docs.map(doc => doc.data().name).sort());
      if (bList.length > 0 && !formData.branch) {
        setFormData(prev => ({ ...prev, branch: bList[0] }));
      }
    };
    fetchConfigs();

    if (userData?.role === 'teacher') {
      setFormData(prev => ({ ...prev, role: 'student' }));
    }

    return () => {
      unsubMappings();
    };
  }, [userData]);

  const handleManualSearch = async (isRefresh = false) => {
    if (!isRefresh && !searchQuery.trim() && filterRole === "all" && filterBranch === "all" && filterSemester === "all") {
      alert("Please enter a name/reg no or select a filter to pull records.");
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    try {
      const q = query(collection(db, "users"), orderBy("name"));
      const snap = await getDocs(q);
      const allUsers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsers(allUsers);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    if (formData.role === 'student') {
      setFormData(prev => ({ ...prev, regNo: selectedPrefix + regSuffix }));
    }
  }, [selectedPrefix, regSuffix, formData.role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ type: "loading" });

    try {
      const res = await fetch("/api/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (data.success) {
        setStatus({ type: "success", message: `${formData.role.charAt(0).toUpperCase() + formData.role.slice(1)} account created successfully!` });
        setFormData({ ...formData, name: "", email: "", password: "", regNo: "" });
        setRegSuffix("");
      } else {
        setStatus({ type: "error", message: data.error || "Failed to create account" });
      }
    } catch (err) {
      setStatus({ type: "error", message: "Something went wrong. Please try again." });
    }
  };

  const handleDeleteUser = async (e: React.MouseEvent, user: any) => {
    e.stopPropagation();

    if (!canModifyUser(user.role)) {
      alert("Unauthorized: Teachers can only remove student records.");
      return;
    }

    if (confirm(`Permanently remove ${user.name}'s record? This cannot be undone.`)) {
      await deleteDoc(doc(db, "users", user.id));
      if (selectedUser?.id === user.id) setView('list');
      setUsers(prev => prev.filter(u => u.id !== user.id));
    }
  };

  const handleUpdateUser = async () => {
    if (!editData) return;
    
    if (!canModifyUser(selectedUser.role)) {
      alert("Unauthorized: Teachers can only modify student records.");
      return;
    }

    try {
      const userRef = doc(db, "users", selectedUser.id);
      await updateDoc(userRef, {
        name: editData.name,
        email: editData.email,
        regNo: editData.regNo,
        role: editData.role,
        branch: editData.branch
      });
      setIsEditMode(false);
      setSelectedUser({ ...selectedUser, ...editData });
    } catch (err) {
      alert("Failed to synchronize user updates.");
    }
  };

  const resolveStudentMeta = (u: any) => {
    if (u.role === 'teacher') return { branch: u.branch || "Faculty", semester: "N/A" };
    if (!u.regNo) return { branch: "N/A", semester: "N/A" };
    const prefix = u.regNo.substring(0, 8);
    const mapping = mappings.find(m => m.prefix === prefix);
    return mapping ? { branch: mapping.branch, semester: mapping.semester } : { branch: "Unmapped", semester: "Unmapped" };
  };

  const filteredUsers = users.filter(u => {
    const meta = resolveStudentMeta(u);
    const matchesSearch = (u.name || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
                         (u.regNo || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = filterRole === "all" || u.role === filterRole;
    const matchesBranch = filterBranch === "all" || meta.branch === filterBranch;
    const matchesSemester = filterSemester === "all" || meta.semester === filterSemester;

    return matchesSearch && matchesRole && matchesBranch && matchesSemester;
  });

  const isAdmin = userData?.role === 'admin';
  const isTeacher = userData?.role === 'teacher';

  const canModifyUser = (targetRole: string) => {
    if (isAdmin) return true;
    if (isTeacher) return targetRole === 'student';
    return false;
  };

  return (
    <div className="max-w-full mx-auto animate-in fade-in duration-500 pb-20">
      <AnimatePresence mode="wait">
        {view === 'list' ? (
          <motion.div 
            key="list"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-10"
          >
            {/* Header */}
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-white flex items-center gap-4">
                <UserPlus className="text-blue-500" size={32} />
                Users
              </h2>
              <p className="text-sm text-slate-400 mt-2">
                {isAdmin ? "Manage Students & Teachers" : "Student Enrollment Portal"}
              </p>
            </div>

            <div className="w-full">
              {/* Enrollment Form */}
              <div className="bg-slate-900/40 rounded-lg border border-slate-800/50 p-4 md:p-6 backdrop-blur-xl shadow-xl">
                <form onSubmit={handleSubmit} className="space-y-6 md:space-y-8" autoComplete="off">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    {isAdmin && (
                      <div className="flex p-1.5 bg-slate-950 rounded-lg border border-slate-800 w-fit">
                        <button 
                          type="button"
                          onClick={() => {
                            setFormData({...formData, role: 'student'});
                            setSelectedPrefix(mappings[0]?.prefix || "");
                          }}
                          className={`flex items-center space-x-2 px-6 py-2.5 rounded-lg text-xs md:text-sm font-bold transition-all ${formData.role === 'student' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                        >
                          <GraduationCap size={16} />
                          <span>Student</span>
                        </button>
                        <button 
                          type="button"
                          onClick={() => {
                            setFormData({...formData, role: 'teacher', regNo: ""});
                            setSelectedPrefix("");
                            setRegSuffix("");
                          }}
                          className={`flex items-center space-x-2 px-6 py-2.5 rounded-lg text-xs md:text-sm font-bold transition-all ${formData.role === 'teacher' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                        >
                          <ShieldCheck size={16} />
                          <span>Teacher</span>
                        </button>
                      </div>
                    )}

                    <div className="space-y-2 flex-1 md:max-w-[240px]">
                      <label className="text-xs font-semibold text-slate-400 ml-1">Branch</label>
                      <select 
                        required
                        value={formData.branch}
                        onChange={e => setFormData({...formData, branch: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm text-white outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer"
                      >
                         {branches.map(b => <option key={`form-branch-${b}`} value={b}>{b}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-400 ml-1">Full Name</label>
                      <input
                        type="text" required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm text-white outline-none focus:border-blue-500 focus:bg-slate-900/50 transition-all placeholder:text-slate-700"
                        placeholder="e.g. Rahul Sharma"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-400 ml-1">
                        {formData.role === 'student' ? 'Reg No / Roll No' : 'Staff ID'}
                      </label>
                      
                      {formData.role === 'student' ? (
                        <div className="flex gap-3">
                           <select 
                             required
                             value={selectedPrefix}
                             onChange={e => setSelectedPrefix(e.target.value)}
                             className="w-1/2 bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm text-blue-400 outline-none focus:border-blue-500 transition-all"
                           >
                              <option value="" disabled>Prefix</option>
                              {mappings.map(m => (
                                <option key={m.prefix} value={m.prefix}>{m.prefix}</option>
                              ))}
                           </select>
                           <input
                             type="text" required
                             maxLength={4}
                             value={regSuffix}
                             onChange={(e) => setRegSuffix(e.target.value.replace(/\D/g, ""))}
                             className="w-1/2 bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm text-white outline-none focus:border-blue-500 transition-all placeholder:text-slate-700"
                             placeholder="Roll No"
                           />
                        </div>
                      ) : (
                        <input
                          type="text" required
                          value={formData.regNo}
                          onChange={(e) => setFormData({ ...formData, regNo: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm text-white outline-none focus:border-indigo-500 transition-all placeholder:text-slate-700"
                          placeholder="T-2026-XXX"
                        />
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-400 ml-1">Email Address</label>
                      <input
                        type="email" required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm text-white outline-none focus:border-blue-500 transition-all placeholder:text-slate-700"
                        placeholder="email@college.edu"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-400 ml-1">Password</label>
                      <input
                        type="password" required
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm text-white outline-none focus:border-blue-500 transition-all placeholder:text-slate-700"
                        placeholder="••••••••"
                        autoComplete="new-password"
                      />
                    </div>
                  </div>

                  {status.type !== "idle" && (
                    <div className={`flex items-center space-x-3 p-4 rounded-lg border ${status.type === 'success' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-rose-400 bg-rose-500/10 border-rose-500/20'}`}>
                      {status.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                      <span className="text-sm font-medium">{status.message || (status.type === 'loading' ? 'Creating user...' : '')}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={status.type === "loading"}
                    className={`w-full py-4 rounded-lg text-sm font-bold transition-all duration-300 disabled:opacity-50 ${formData.role === 'student' ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg'}`}
                  >
                    {status.type === "loading" ? "Creating User..." : `Create ${formData.role}`}
                  </button>
                </form>
              </div>
            </div>

            {/* Users Table Section */}
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                 <div className="flex items-center gap-3">
                    <UserIcon size={24} className="text-blue-500" />
                    <h4 className="text-xl font-bold text-white">User List</h4>
                 </div>

                 <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    <div className="relative flex flex-1 md:flex-initial items-center gap-2">
                       <div className="relative w-full md:w-auto">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                          <input 
                            type="text" placeholder="Search by name or reg no..."
                            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleManualSearch()}
                            className="w-full md:w-56 bg-slate-900/50 border border-slate-800 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white outline-none focus:border-blue-500 transition-all"
                          />
                       </div>
                        <button 
                          onClick={() => handleManualSearch()}
                          disabled={isSearching}
                          className="p-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50 shrink-0"
                        >
                           <Search size={18} />
                        </button>
                        <button 
                          onClick={() => handleManualSearch(true)}
                          disabled={isSearching}
                          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all border border-slate-700 disabled:opacity-50 shrink-0"
                        >
                           <RefreshCw size={18} className={isSearching ? "animate-spin" : ""} />
                        </button>
                    </div>
                    <select 
                      value={filterRole} onChange={e => setFilterRole(e.target.value)}
                      className="bg-slate-900/50 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-300 outline-none flex-1 md:flex-initial"
                    >
                       <option value="all">All Roles</option>
                       <option value="teacher">Teachers</option>
                       <option value="student">Students</option>
                       <option value="admin">Admins</option>
                    </select>
                    <select 
                      value={filterBranch} onChange={e => setFilterBranch(e.target.value)}
                      className="bg-slate-900/50 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-300 outline-none flex-1 md:flex-initial"
                    >
                       <option value="all">All Branches</option>
                       {branches.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <select 
                      value={filterSemester} onChange={e => setFilterSemester(e.target.value)}
                      className="bg-slate-900/50 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-300 outline-none flex-1 md:flex-initial"
                    >
                       <option value="all">All Sems</option>
                       {semesters.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                 </div>
              </div>

              {!hasSearched ? (
                <div className="h-64 flex flex-col items-center justify-center bg-slate-900/20 border border-slate-800 rounded-lg">
                   <div className="p-4 bg-slate-900 rounded-lg border border-slate-800 mb-4 opacity-50">
                      <Search className="text-slate-500" size={32} />
                   </div>
                   <p className="text-sm font-semibold text-slate-400">Search to load users</p>
                </div>
              ) : isSearching ? (
                <div className="h-64 flex flex-col items-center justify-center bg-slate-900/20 border border-slate-800 rounded-lg">
                   <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                   <p className="text-sm font-semibold text-blue-500">Loading users...</p>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center bg-slate-900/20 border border-slate-800 rounded-lg">
                   <X size={32} className="text-rose-500 opacity-50 mb-4" />
                   <p className="text-sm font-semibold text-slate-400">No users found</p>
                </div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-slate-900/20 border border-slate-800 rounded-lg overflow-hidden shadow-xl"
                >
                  <div className="overflow-x-auto custom-scrollbar">
                      {/* Mobile Card View */}
                      <div className="block md:hidden divide-y divide-slate-800/30">
                        {filteredUsers.map((u) => {
                          const meta = resolveStudentMeta(u);
                          return (
                            <div 
                              key={u.id}
                              onClick={() => {
                                setSelectedUser(u);
                                setEditData({ ...u });
                                setIsEditMode(false);
                                setView('profile');
                              }}
                              className="p-4 hover:bg-slate-800/20 transition-all cursor-pointer space-y-3"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${u.role === 'teacher' ? 'bg-indigo-600/20 text-indigo-400' : u.role === 'admin' ? 'bg-amber-600/20 text-amber-400' : 'bg-blue-600/20 text-blue-400'}`}>
                                      {u.name?.charAt(0)}
                                  </div>
                                  <div className="min-w-0">
                                      <p className="text-sm font-semibold text-white truncate">{u.name}</p>
                                      <p className="text-xs text-slate-500 truncate">{u.regNo || "N/A"}</p>
                                  </div>
                                </div>
                                {canModifyUser(u.role) && (
                                  <button 
                                    onClick={(e) => handleDeleteUser(e, u)}
                                    className="p-2.5 text-rose-500 bg-rose-500/10 hover:bg-rose-500 hover:text-white rounded-lg transition-all shrink-0 ml-2"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </div>
                              <div className="flex items-center justify-between bg-slate-950/50 p-2 rounded-lg border border-slate-800/50">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${u.role === 'teacher' ? 'text-indigo-400' : u.role === 'admin' ? 'text-amber-400' : 'text-blue-400'}`}>
                                  {u.role}
                                </span>
                                <div className="flex items-center gap-2 text-xs">
                                    <span className="font-medium text-slate-300">{meta.branch}</span>
                                    {u.role === 'student' && (
                                      <>
                                        <span className="text-slate-600">•</span>
                                        <span className="font-medium text-indigo-400">{meta.semester}</span>
                                      </>
                                    )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Desktop Table View */}
                      <table className="hidden md:table w-full text-left whitespace-nowrap">
                        <thead className="bg-slate-950/80 border-b border-slate-800">
                            <tr>
                              <th className="px-6 py-4 text-xs font-semibold text-slate-400">User</th>
                              <th className="px-6 py-4 text-xs font-semibold text-slate-400">Role</th>
                              <th className="px-6 py-4 text-xs font-semibold text-slate-400">Branch & Sem</th>
                              <th className="px-6 py-4 text-xs font-semibold text-slate-400 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/30">
                            {filteredUsers.map((u) => {
                              const meta = resolveStudentMeta(u);
                              return (
                                <tr 
                                  key={u.id} 
                                  onClick={() => {
                                    setSelectedUser(u);
                                    setEditData({ ...u });
                                    setIsEditMode(false);
                                    setView('profile');
                                  }}
                                  className="hover:bg-slate-800/20 transition-all cursor-pointer group"
                                >
                                  <td className="px-6 py-4">
                                      <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${u.role === 'teacher' ? 'bg-indigo-600/20 text-indigo-400' : u.role === 'admin' ? 'bg-amber-600/20 text-amber-400' : 'bg-blue-600/20 text-blue-400'}`}>
                                            {u.name?.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors">{u.name}</p>
                                            <p className="text-xs text-slate-500">{u.regNo || "N/A"}</p>
                                        </div>
                                      </div>
                                  </td>
                                  <td className="px-6 py-4">
                                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${u.role === 'teacher' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : u.role === 'admin' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                                        {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                                      </span>
                                  </td>
                                  <td className="px-6 py-4">
                                      <div className="flex items-center gap-2">
                                          <div className="flex items-center gap-1.5">
                                            <Layers size={14} className="text-slate-500" />
                                            <span className="text-sm font-medium text-slate-300">{meta.branch}</span>
                                          </div>
                                          {u.role === 'student' && (
                                            <>
                                              <span className="text-slate-600">-</span>
                                              <div className="flex items-center gap-1.5">
                                                <BookOpen size={14} className="text-slate-500" />
                                                <span className="text-sm font-medium text-indigo-400">{meta.semester}</span>
                                              </div>
                                            </>
                                          )}
                                      </div>
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                      {canModifyUser(u.role) && (
                                        <button 
                                          onClick={(e) => handleDeleteUser(e, u)}
                                          className="p-2.5 text-rose-500 bg-rose-500/10 hover:bg-rose-500 hover:text-white rounded-lg transition-all"
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                      )}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="profile"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="max-w-3xl mx-auto"
          >
            <div className="bg-slate-900/40 rounded-lg border border-slate-800/50 overflow-hidden backdrop-blur-2xl shadow-2xl">
                {/* Profile Header */}
                <div className="bg-gradient-to-r from-blue-600/10 to-indigo-600/10 p-6 md:p-8 border-b border-slate-800/50">
                    <div className="flex flex-col md:flex-row items-center gap-6">
                        <div className="w-24 h-24 md:w-28 md:h-28 rounded-lg bg-slate-950 border-2 border-slate-800 flex items-center justify-center text-3xl font-bold text-blue-500 shadow-xl relative">
                            {selectedUser?.name?.charAt(0)}
                            <div className="absolute -bottom-2 -right-2 p-1.5 bg-blue-600 rounded-lg shadow-lg">
                               <ShieldCheck size={16} className="text-white" />
                            </div>
                        </div>
                        <div className="text-center md:text-left space-y-2">
                            <h3 className="text-2xl md:text-3xl font-bold text-white">{selectedUser?.name}</h3>
                            <div className="flex flex-wrap justify-center md:justify-start gap-2">
                                <span className="px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs font-semibold text-blue-400 capitalize">
                                    {selectedUser?.role}
                                </span>
                                <span className="px-3 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-medium text-slate-400">
                                    {selectedUser?.regNo || "N/A"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 md:p-8 space-y-8">
                    {isEditMode ? (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-400">Full Name</label>
                                    <input 
                                        value={editData.name}
                                        onChange={e => setEditData({...editData, name: e.target.value})}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm text-white outline-none focus:border-blue-500 transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-400">Reg No / ID</label>
                                    <input 
                                        value={editData.regNo}
                                        onChange={e => setEditData({...editData, regNo: e.target.value})}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm text-white outline-none focus:border-blue-500 transition-all"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-400">Email</label>
                                    <input 
                                        value={editData.email}
                                        onChange={e => setEditData({...editData, email: e.target.value})}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm text-white outline-none focus:border-blue-500 transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-400">Branch</label>
                                    <select 
                                        value={editData.branch}
                                        onChange={e => setEditData({...editData, branch: e.target.value})}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm text-white outline-none focus:border-blue-500 transition-all appearance-none"
                                    >
                                        {branches.map(b => <option key={`edit-branch-${b}`} value={b}>{b}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="flex gap-4 pt-4">
                                <button 
                                    onClick={handleUpdateUser}
                                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3.5 rounded-lg text-sm font-semibold transition-all shadow-lg shadow-blue-900/20"
                                >
                                    Save Changes
                                </button>
                                <button 
                                    onClick={() => setIsEditMode(false)}
                                    className="px-8 bg-slate-950 border border-slate-800 text-slate-400 hover:text-white py-3.5 rounded-lg text-sm font-semibold transition-all"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
                                <div className="p-4 md:p-6 bg-slate-950/50 border border-slate-800/50 rounded-lg space-y-1">
                                    <p className="text-xs font-medium text-slate-500">Reg No</p>
                                    <p className="text-sm font-semibold text-blue-400">{selectedUser?.regNo || "N/A"}</p>
                                </div>
                                <div className="p-4 md:p-6 bg-slate-950/50 border border-slate-800/50 rounded-lg space-y-1">
                                    <p className="text-xs font-medium text-slate-500">Email</p>
                                    <p className="text-sm font-semibold text-slate-300 truncate" title={selectedUser?.email}>{selectedUser?.email}</p>
                                </div>
                                <div className="p-4 md:p-6 bg-slate-950/50 border border-slate-800/50 rounded-lg space-y-1">
                                    <p className="text-xs font-medium text-slate-500">Branch</p>
                                    <p className="text-sm font-semibold text-indigo-400">{resolveStudentMeta(selectedUser).branch}</p>
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-4">
                                {canModifyUser(selectedUser?.role) && (
                                    <button 
                                        onClick={() => setIsEditMode(true)}
                                        className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-white text-slate-900 py-3.5 rounded-lg text-sm font-semibold transition-all shadow-lg"
                                    >
                                        <Edit3 size={18} />
                                        Edit Profile
                                    </button>
                                )}
                                <button 
                                    onClick={() => setView('list')}
                                    className="flex-1 flex items-center justify-center gap-2 bg-slate-900 border border-slate-800 text-slate-300 hover:text-white py-3.5 rounded-lg text-sm font-semibold transition-all"
                                >
                                    <ArrowLeft size={18} />
                                    Back
                                </button>
                                {canModifyUser(selectedUser?.role) && (
                                    <button 
                                        onClick={(e) => handleDeleteUser(e, selectedUser)}
                                        className="px-6 flex items-center justify-center bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white py-3.5 rounded-lg transition-all"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
