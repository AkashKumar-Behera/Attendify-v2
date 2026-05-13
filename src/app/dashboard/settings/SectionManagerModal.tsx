import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Trash2, Layers, Users, Check, Edit2 } from "lucide-react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function SectionManagerModal({ 
  batch, 
  onClose 
}: { 
  batch: any; 
  onClose: () => void;
}) {
  const [sections, setSections] = useState<any[]>(batch.sections || []);
  const [newSection, setNewSection] = useState({ name: "", startRoll: "", endRoll: "" });
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState({ name: "", startRoll: "", endRoll: "" });
  
  const handleSaveSections = async (updatedSections: any[]) => {
    try {
      await updateDoc(doc(db, "batchMappings", batch.id), {
        sections: updatedSections
      });
      setSections(updatedSections);
    } catch (error) {
      console.error("Failed to update sections:", error);
      alert("Failed to update sections.");
    }
  };

  const handleAddSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSection.name || !newSection.startRoll || !newSection.endRoll) return;
    
    const newSec = {
      id: Date.now().toString(),
      ...newSection,
      groups: []
    };
    
    const updated = [...sections, newSec];
    await handleSaveSections(updated);
    setNewSection({ name: "", startRoll: "", endRoll: "" });
  };

  const handleDeleteSection = async (secId: string) => {
    if (!confirm("Delete this section?")) return;
    const updated = sections.filter(s => s.id !== secId);
    await handleSaveSections(updated);
  };

  const handleAddGroup = async (e: React.FormEvent, secId: string) => {
    e.preventDefault();
    if (!newGroup.name || !newGroup.startRoll || !newGroup.endRoll) return;

    const updated = sections.map(s => {
      if (s.id === secId) {
        return {
          ...s,
          groups: [...(s.groups || []), { id: Date.now().toString(), ...newGroup }]
        };
      }
      return s;
    });

    await handleSaveSections(updated);
    setNewGroup({ name: "", startRoll: "", endRoll: "" });
  };

  const handleDeleteGroup = async (secId: string, groupId: string) => {
    if (!confirm("Delete this group?")) return;
    const updated = sections.map(s => {
      if (s.id === secId) {
        return {
          ...s,
          groups: (s.groups || []).filter((g: any) => g.id !== groupId)
        };
      }
      return s;
    });
    await handleSaveSections(updated);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/90 backdrop-blur-2xl"
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 30 }}
        className="relative w-full max-w-4xl bg-slate-900 border border-white/10 rounded-lg shadow-[0_0_100px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-[100px] pointer-events-none"></div>

        <div className="flex items-center justify-between p-6 border-b border-white/5 relative z-10 shrink-0">
          <div className="flex items-center gap-4 sm:gap-6">
             <div className="p-3 sm:p-4 bg-blue-500/20 rounded-lg border border-blue-500/30">
              <Layers size={24} className="text-blue-400" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white uppercase tracking-[0.4em] italic leading-tight">Section Config</h3>
              <p className="text-[9px] sm:text-[10px] text-blue-400 font-bold uppercase tracking-[0.3em] mt-1.5 italic">Batch: {batch.prefix}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 sm:p-3 hover:bg-slate-800 rounded-lg text-slate-600 hover:text-white transition-all border border-transparent hover:border-white/5">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-8 relative z-10 no-scrollbar">
          
          <form onSubmit={handleAddSection} className="grid grid-cols-1 sm:grid-cols-4 gap-4 bg-slate-950/60 p-4 rounded-lg border border-white/5 shadow-inner">
            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] ml-2">Section Name</label>
              <input 
                required
                type="text" placeholder="e.g. Sec A"
                value={newSection.name} onChange={e => setNewSection({...newSection, name: e.target.value.toUpperCase()})}
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-3 text-xs font-black text-white focus:border-blue-500/50 transition-all outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] ml-2">From Roll</label>
              <input 
                required
                type="text" placeholder="e.g. 7001"
                value={newSection.startRoll} onChange={e => setNewSection({...newSection, startRoll: e.target.value})}
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-3 text-xs font-mono font-black text-slate-300 focus:border-blue-500/50 transition-all outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] ml-2">To Roll</label>
              <input 
                required
                type="text" placeholder="e.g. 7084"
                value={newSection.endRoll} onChange={e => setNewSection({...newSection, endRoll: e.target.value})}
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-3 text-xs font-mono font-black text-slate-300 focus:border-blue-500/50 transition-all outline-none"
              />
            </div>
            <div className="flex items-end">
              <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-black text-[10px] uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2">
                <Plus size={14} /> Add Sec
              </button>
            </div>
          </form>

          <div className="space-y-4">
            {sections.map(sec => (
              <div key={sec.id} className="bg-slate-900/50 border border-white/5 rounded-lg overflow-hidden transition-all group">
                <div 
                  onClick={() => setActiveSectionId(activeSectionId === sec.id ? null : sec.id)}
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/[0.02]"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
                    <div>
                      <h4 className="text-sm font-black text-white uppercase tracking-widest">{sec.name}</h4>
                      <p className="text-[10px] text-slate-500 font-mono mt-1 tracking-widest">
                        {sec.startRoll} - {sec.endRoll}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest bg-slate-950 px-3 py-1 rounded-full border border-white/5">
                      {sec.groups?.length || 0} Groups
                    </span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDeleteSection(sec.id); }}
                      className="p-2 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {activeSectionId === sec.id && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-white/5 bg-slate-950/30"
                    >
                      <div className="p-4 sm:p-6 space-y-6">
                        {/* Groups List */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {(sec.groups || []).map((grp: any) => (
                            <div key={grp.id} className="bg-slate-900 border border-indigo-500/20 rounded-lg p-3 flex items-center justify-between">
                              <div>
                                <h5 className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                                  <Users size={12} /> {grp.name}
                                </h5>
                                <p className="text-[10px] text-slate-500 font-mono mt-1">
                                  {grp.startRoll} - {grp.endRoll}
                                </p>
                              </div>
                              <button 
                                onClick={() => handleDeleteGroup(sec.id, grp.id)}
                                className="p-1.5 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>

                        {/* Add Group Form */}
                        <form 
                          onSubmit={(e) => handleAddGroup(e, sec.id)}
                          className="flex flex-col sm:flex-row gap-3 bg-slate-900/50 p-3 rounded-lg border border-white/5"
                        >
                          <input 
                            required type="text" placeholder="Group Name (e.g. Grp 1)"
                            value={newGroup.name} onChange={e => setNewGroup({...newGroup, name: e.target.value.toUpperCase()})}
                            className="flex-1 bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs font-black text-white outline-none focus:border-indigo-500/50"
                          />
                          <input 
                            required type="text" placeholder="Start Roll"
                            value={newGroup.startRoll} onChange={e => setNewGroup({...newGroup, startRoll: e.target.value})}
                            className="w-full sm:w-24 bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono font-black text-slate-300 outline-none focus:border-indigo-500/50"
                          />
                          <input 
                            required type="text" placeholder="End Roll"
                            value={newGroup.endRoll} onChange={e => setNewGroup({...newGroup, endRoll: e.target.value})}
                            className="w-full sm:w-24 bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono font-black text-slate-300 outline-none focus:border-indigo-500/50"
                          />
                          <button type="submit" className="w-full sm:w-auto px-4 py-2 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-lg font-black text-[10px] uppercase tracking-widest transition-all">
                            Add Grp
                          </button>
                        </form>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}

            {sections.length === 0 && (
              <div className="py-12 border border-dashed border-white/10 rounded-lg flex flex-col items-center justify-center opacity-50">
                <Layers size={32} className="text-slate-500 mb-4" />
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">No Sections Configured</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
