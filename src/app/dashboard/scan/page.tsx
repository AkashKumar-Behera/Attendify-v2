"use client";

import { useEffect, useState, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { db } from "@/lib/firebase";
import { doc, updateDoc, collection, addDoc, setDoc, onSnapshot, getDocs, query, where } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { CheckCircle2, AlertTriangle, MapPin, Scan, ShieldCheck, RefreshCw, Power, PowerOff, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

// GLOBAL SINGLETON: Ensures we have a handle on the scanner even after component unmounts
let globalScannerInstance: Html5Qrcode | null = null;

function getDistanceFromLatLonInM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // Radius of the earth in m
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  return R * c; 
}

export default function ScanPage() {
  const { user, userData } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<{ type: "idle" | "success" | "error" | "warning"; message?: string }>({ type: "idle" });
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [locationHistory, setLocationHistory] = useState<{lat: number, lng: number}[]>([]);
  const [isMockLocation, setIsMockLocation] = useState(false);
  const [allowedCoordinates, setAllowedCoordinates] = useState<any[]>([]);

  // NUCLEAR KILL SWITCH: Stops EVERYTHING related to media
  const nuclearKillCamera = async (isStarting = false) => {
    console.log(`☢️ NUCLEAR CAMERA KILL INITIATED (isStarting: ${isStarting}) ☢️`);
    setIsInitializing(false);
    
    // 1. Stop Global Instance
    if (globalScannerInstance) {
      try {
        if (globalScannerInstance.isScanning) {
          await globalScannerInstance.stop();
        }
        globalScannerInstance.clear();
      } catch (err) {
        console.warn("Global instance stop failed", err);
      }
      globalScannerInstance = null;
    }

    // 2. Kill all Browser Media Streams (Managed Sweep)
    const performSweep = () => {
        if (typeof window !== "undefined") {
            try {
                const allVideos = document.querySelectorAll("video");
                allVideos.forEach(video => {
                    const stream = video.srcObject as MediaStream;
                    if (stream) {
                        stream.getTracks().forEach(track => {
                            track.stop();
                            console.log("Stopped track:", track.label);
                        });
                        video.srcObject = null;
                    }
                    video.pause();
                    video.src = ""; 
                    video.load(); 
                });

                const container = document.getElementById("reader");
                if (container && !isStarting) container.innerHTML = "";
            } catch (e) {
                console.error("Hardware termination sweep failed", e);
            }
        }
    };

    // Run sweep immediately
    performSweep();
    
    // ONLY run delayed sweeps if we are NOT trying to start a new camera
    if (!isStarting) {
        setTimeout(performSweep, 300);
        setTimeout(performSweep, 1000);
        setIsCameraActive(false);
    }
  };

  const handleStartCamera = async () => {
    if (isCameraActive || isInitializing) return;
    
    setIsInitializing(true);
    setStatus({ type: "idle" });

    try {
      // Use isStarting = true to prevent clearing the new video surface
      await nuclearKillCamera(true); 

      const html5QrCode = new Html5Qrcode("reader");
      globalScannerInstance = html5QrCode;

      const config = { 
        fps: 25, 
        qrbox: (viewfinderWidth: number, viewFinderHeight: number) => {
            const minEdge = Math.min(viewfinderWidth, viewFinderHeight);
            let boxSize = Math.floor(minEdge * 0.7);
            if (boxSize < 150) boxSize = 150; 
            return { width: boxSize, height: boxSize };
        },
        aspectRatio: 1.0
      };

      await html5QrCode.start(
        { facingMode: "environment" },
        config, 
        onScanSuccess, 
        onScanFailure
      );

      setIsCameraActive(true);
    } catch (err) {
      console.error("Start failed:", err);
      setStatus({ type: "error", message: "Sensor Initialization Failed. Check Permissions." });
      await nuclearKillCamera(false);
    } finally {
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    let watchId: number;

    const unsubC = onSnapshot(collection(db, "allowedCoordinates"), (snap) => {
        setAllowedCoordinates(snap.docs.map(d => d.data()));
    });

    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (!mounted) return;
          const newLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setLocation(newLoc);
          
          setLocationHistory(prev => {
            const updated = [...prev, newLoc].slice(-5);
            if (updated.length >= 3) {
              const allIdentical = updated.every(loc => loc.lat === newLoc.lat && loc.lng === newLoc.lng);
              const isAndroid = /android/i.test(navigator.userAgent || navigator.vendor || (window as any).opera);
              if (isAndroid && allIdentical) {
                setIsMockLocation(true);
              } else if (!allIdentical) {
                setIsMockLocation(false);
              }
            }
            return updated;
          });
        },
        (err) => console.error("Location error", err),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
      );
    }

    return () => {
      mounted = false;
      if (watchId) navigator.geolocation.clearWatch(watchId);
      unsubC();
      nuclearKillCamera();
    };
  }, []);

  async function onScanSuccess(decodedText: string) {
    if (status.type === "success") return;

    if (decodedText.startsWith("LOGIN_SB:") && userData?.role === "teacher") {
      const sessionId = decodedText.split(":")[1];
      try {
        await updateDoc(doc(db, "smartboardSessions", sessionId), {
          status: "authenticated",
          teacherId: user?.uid,
          teacherName: userData?.name,
          authenticatedAt: new Date(),
        });
        setStatus({ type: "success", message: "Synchronized!" });
        await nuclearKillCamera();
      } catch (err) {
        setStatus({ type: "error", message: "Sync Failed" });
      }
    } 
    else if (decodedText.startsWith("EXPIRED_SESSION:")) {
        setStatus({ type: "error", message: "QR Code Expired. You were too slow!" });
        return;
    }
    else if (decodedText.startsWith("ATTENDANCE:") && userData?.role === "student") {
        const parts = decodedText.split(":");
        const sessionId = parts[1];
        const scannedNonce = parseInt(parts[2]);

        if (!location) {
            setStatus({ type: "error", message: "GPS Location Required" });
            return;
        }

        try {
            // SECURITY CHECK: Fetch session status and current nonce
            const sessionRef = doc(db, "smartboardSessions", sessionId);
            const sessionSnap = await getDocs(query(collection(db, "smartboardSessions"), where("boardId", "==", sessionId)));
            
            if (sessionSnap.empty) {
                setStatus({ type: "error", message: "Invalid Session" });
                return;
            }

            const sessionData = sessionSnap.docs[0].data();

            // 1. Check if session is still open
            if (sessionData.status !== "marking-attendance") {
                setStatus({ type: "error", message: "Session Locked. Too late!" });
                return;
            }

            // 2. Verify QR Nonce (Anti-Cheat)
            if (sessionData.currentNonce !== scannedNonce) {
                setStatus({ type: "error", message: "Expired QR. Please scan the live code." });
                return;
            }

            let attendanceStatus = "present";
            let msg = "Attendance Marked!";
            let type: "success" | "error" | "warning" = "success";

            if (isMockLocation) {
                setStatus({ type: "error", message: "Mock Location Detected. Rejected." });
                return;
            } else if (allowedCoordinates.length > 0) {
                const isWithinRange = allowedCoordinates.some(coord => {
                    const dist = getDistanceFromLatLonInM(location.lat, location.lng, coord.lat, coord.lng);
                    return dist <= 50;
                });
                if (!isWithinRange) {
                    setStatus({ type: "error", message: "Out of Classroom bounds. Rejected." });
                    return;
                }
            }

            await setDoc(doc(db, "attendance", `${sessionId}_${user?.uid}`), {
                studentId: user?.uid,
                studentName: userData?.name,
                regNo: userData?.regNo,
                prefix: userData?.prefix,
                sessionId: sessionId,
                location: location,
                timestamp: new Date(),
                status: attendanceStatus
            });
            
            setStatus({ type, message: msg });
            await nuclearKillCamera();
        } catch (err) {
            console.error("Attendance submission error:", err);
            setStatus({ type: "error", message: "Verification Failed" });
        }
    }
  }

  function onScanFailure(error: any) {}

  return (
    <div className="max-w-md mx-auto space-y-6 animate-in fade-in zoom-in duration-300 p-4">
      {/* Fake GPS Blocker Overlay */}
      {isMockLocation && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-xl animate-in fade-in duration-300">
           <div className="max-w-md w-full bg-slate-900 border border-rose-500/20 p-8 rounded-3xl text-center shadow-[0_0_50px_rgba(244,63,94,0.1)]">
              <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6 border border-rose-500/20">
                 <AlertTriangle size={32} />
              </div>
              <h2 className="text-xl font-black text-white uppercase tracking-widest mb-3">Fake GPS Detected</h2>
              <p className="text-xs text-slate-400 font-medium mb-8 leading-relaxed">
                 You appear to be using a Mock Location or Fake GPS application. Scanning is disabled until you use your real location.
              </p>
              <button onClick={() => { nuclearKillCamera(); router.back(); }} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all">
                 Return to Dashboard
              </button>
           </div>
        </div>
      )}
      <div className="card-premium p-6 md:p-8 relative overflow-hidden">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/10 rounded-lg text-blue-500 border border-blue-500/20">
              <Scan size={18} />
            </div>
            <div>
               <h2 className="text-[10px] font-black text-white uppercase tracking-widest leading-none">Optical Sensor</h2>
               <p className="text-[8px] text-slate-500 font-bold uppercase tracking-tighter mt-1">Ready for Capture</p>
            </div>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${location ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'}`}>
            <MapPin size={10} />
            <span>{location ? "GPS Active" : "GPS Pending"}</span>
          </div>
        </div>

        <div className="relative aspect-square rounded-lg overflow-hidden border border-slate-800 bg-slate-950 group">
            {!isCameraActive && (
                <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm flex-col gap-4">
                    {isInitializing ? (
                        <>
                            <RefreshCw className="text-blue-500 animate-spin" size={32} />
                            <p className="text-[8px] font-black text-blue-500 uppercase tracking-widest animate-pulse">Initializing Sensors...</p>
                        </>
                    ) : (
                        <>
                            <div className="w-16 h-16 rounded-lg bg-blue-600/10 flex items-center justify-center border border-blue-500/20 mb-2">
                                <Scan size={32} className="text-blue-500/40" />
                            </div>
                            <button 
                                onClick={handleStartCamera}
                                className="btn-3d-blue px-8 py-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
                            >
                                <Power size={14} /> 
                                <span>Start Camera</span>
                            </button>
                            <p className="text-[7px] text-slate-500 font-bold uppercase tracking-tighter mt-2 text-center px-8">
                                Camera hardware remains offline until explicitly activated.
                            </p>
                        </>
                    )}
                </div>
            )}

            <div className="absolute inset-0 z-20 pointer-events-none border-[3rem] border-black/40"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-2 border-blue-500/40 rounded-lg z-30 shadow-[0_0_0_1000px_rgba(0,0,0,0.5)]">
                <div className="scanner-line"></div>
                <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-blue-400/60 rounded-tl-lg"></div>
                <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-blue-400/60 rounded-tr-lg"></div>
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-blue-400/60 rounded-bl-lg"></div>
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-blue-400/60 rounded-br-lg"></div>
            </div>

            <div id="reader" className="w-full h-full"></div>
        </div>

        <div className="mt-8 flex flex-col gap-4">
            {isCameraActive && (
                <button 
                    onClick={async () => {
                        await nuclearKillCamera(false);
                        router.back();
                    }}
                    className="w-full py-4 bg-slate-900/50 hover:bg-slate-900 border border-slate-800 text-slate-300 rounded-lg flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all group shadow-xl"
                >
                    <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                    <span>Terminate & Go Back</span>
                </button>
            )}
            
            <div className="flex items-center justify-center gap-3 text-slate-500">
                <ShieldCheck size={14} className="text-blue-500/50" />
                <p className="text-[8px] font-black uppercase tracking-widest leading-none">
                    Encrypted Synchronization Active
                </p>
            </div>
        </div>
      </div>

      {(status.type === "success" || status.type === "error" || status.type === "warning") && (
        <div className={`p-5 rounded-lg flex items-center gap-4 animate-in slide-in-from-top-4 duration-300 ${
            status.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 
            status.type === 'warning' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
            'bg-rose-500/10 border-rose-500/20 text-rose-400'
        }`}>
          {status.type === "success" ? <CheckCircle2 className="flex-shrink-0" size={20} /> : <AlertTriangle className="flex-shrink-0" size={20} /> }
          <div className="flex-1">
             <p className="text-[9px] font-black uppercase tracking-widest mb-0.5">{status.type === "success" ? "Success" : status.type === "warning" ? "Warning" : "Failed"}</p>
             <p className="text-[10px] font-bold opacity-70">{status.message}</p>
          </div>
        </div>
      )}

      <button 
        onClick={async () => {
          await nuclearKillCamera();
          router.back();
        }}
        className="btn-3d-slate w-full py-4 text-[9px] font-black uppercase tracking-[0.2em]"
      >
        Go Back
      </button>
    </div>
  );
}
