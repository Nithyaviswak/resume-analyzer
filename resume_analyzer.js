import React, { useState, useRef, useEffect } from 'react';
import { 
  FileText, Briefcase, Search, CheckCircle, AlertCircle, 
  TrendingUp, X, Loader2, Upload, ArrowRight, Wand, 
  Zap, Target, LogOut, Linkedin, Github, Mail
} from 'lucide-react';

// --- Firebase Imports ---
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

// --- Helper: Safely Access Environment Variables ---
// This prevents crashes if import.meta is not available in the current environment
const getEnv = (key) => {
  try {
    return import.meta.env[key];
  } catch (e) {
    console.warn(`Environment variable ${key} not accessible directly.`);
    return ""; 
  }
};

// --- Helper: Dynamic PDF Loader ---
// We use a dynamic loader to avoid build errors with 'pdfjs-dist'
const ensurePdfJsLoaded = async () => {
  if (window.pdfjsLib) return window.pdfjsLib;

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      // Set worker after loading
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error("Failed to load PDF library"));
    document.head.appendChild(script);
  });
};

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: getEnv('VITE_FIREBASE_API_KEY'),
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnv('VITE_FIREBASE_APP_ID')
};

// Initialize Firebase (Safely check if config exists)
let auth;
try {
  if (firebaseConfig.apiKey) {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
  }
} catch (error) {
  console.error("Firebase not initialized. Check your .env file.");
}

const App = () => {
  // Auth State
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // App State
  const [resumeText, setResumeText] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  
  const fileInputRef = useRef(null);

  // Listen for Auth Changes
  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- Auth Functions ---
  const handleGoogleLogin = async () => {
    if (!auth) {
      setError("Firebase not configured. Check your .env file.");
      return;
    }
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error(error);
      setError("Login failed. Please check your Firebase configuration.");
    }
  };

  const handleLogout = async () => {
    if (auth) await signOut(auth);
    setResult(null);
    setResumeText('');
    setJobDescription('');
  };

  // --- PDF & Analysis Functions ---
  const processFile = async (file) => {
    if (!file) return;
    setFileName(file.name);
    setError(null);

    if (file.type === 'application/pdf') {
      try {
        setLoading(true);
        const pdfLib = await ensurePdfJsLoaded();
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfLib.getDocument(arrayBuffer).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item) => item.str).join(' ');
          fullText += pageText + '\n';
        }
        setResumeText(fullText);
      } catch (err) {
        console.error(err);
        setError("Could not read PDF. Ensure it is text-based (not scanned).");
      } finally {
        setLoading(false);
      }
    } else if (file.type === 'text/plain') {
      const text = await file.text();
      setResumeText(text);
    } else {
      setError("Unsupported file type. Please use PDF or TXT.");
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    processFile(file);
    event.target.value = ''; 
  };

  const analyzeResume = async () => {
    if (!resumeText.trim() || !jobDescription.trim()) {
      setError("Please provide both a resume and a job description.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    // Securely get API Key from .env
    const apiKey = getEnv('VITE_GEMINI_API_KEY');
    
    if (!apiKey) {
      setError("API Key missing! Please add VITE_GEMINI_API_KEY to your .env file.");
      setLoading(false);
      return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    const systemPrompt = `You are an expert AI ATS. Compare the Resume to the Job Description. Return strictly valid JSON: {"matchScore": number, "summary": "string", "missingKeywords": [], "strengths": [], "improvements": []}`;
    const userPrompt = `RESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jobDescription}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] }
        })
      });

      if (!response.ok) throw new Error("API Request Failed");
      const data = await response.json();
      let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      setResult(JSON.parse(rawText));

    } catch (err) {
      console.error(err);
      setError("Analysis failed. Check your API key or connection.");
    } finally {
      setLoading(false);
    }
  };

  // --- Render Loading State ---
  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  }

  // --- Render Login Screen (If not logged in) ---
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-white/50">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-200">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 mb-2">ATS<span className="text-blue-600">Pro</span></h1>
          <p className="text-slate-500 mb-8">Sign in to optimize your career path with AI.</p>
          
          <button 
            onClick={handleGoogleLogin}
            className="w-full py-3 px-4 bg-white border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50 text-slate-700 font-bold rounded-xl transition-all flex items-center justify-center gap-3 group"
          >
            <span className="font-bold text-lg text-blue-500">G</span>
            Sign in with Google
            <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-blue-500" />
          </button>
          {error && <p className="mt-4 text-xs text-red-500 bg-red-50 p-2 rounded">{error}</p>}
        </div>
      </div>
    );
  }

  // --- Render Main App (If logged in) ---
  return (
    <div className="min-h-screen font-sans bg-slate-50 text-slate-900 flex flex-col">
      
      {/* Navbar */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg shadow-md shadow-blue-200">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-slate-800 tracking-tight">ATS<span className="text-blue-600">Pro</span></span>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full">
              {user.photoURL && <img src={user.photoURL} alt="Profile" className="w-6 h-6 rounded-full" />}
              <span className="text-sm font-semibold text-slate-600">{user.displayName || user.email}</span>
            </div>
            <button onClick={handleLogout} className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition-colors" title="Sign Out">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-grow max-w-7xl mx-auto px-4 md:px-8 py-10 w-full">
        <div className="text-center mb-10 space-y-2">
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900">
            Optimize Your <span className="text-blue-600">Career Path</span>
          </h1>
          <p className="text-slate-500 text-lg max-w-2xl mx-auto">
            Compare your resume against job descriptions using advanced AI analysis.
          </p>
        </div>

        <div className="grid lg:grid-cols-12 gap-8">
          {/* Inputs Section */}
          <div className="lg:col-span-5 space-y-6">
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700 animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium">{error}</span>
                <button onClick={() => setError(null)} className="ml-auto hover:bg-red-100 p-1 rounded-full"><X className="w-4 h-4" /></button>
              </div>
            )}

            <div 
              className={`border-2 border-dashed rounded-xl transition-all duration-200 p-1 ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white hover:border-blue-400'}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); processFile(e.dataTransfer.files[0]); }}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <label className="flex items-center gap-2 font-bold text-slate-700">
                  <FileText className="w-5 h-5 text-blue-600" />
                  Resume
                </label>
                {fileName && <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md">{fileName}</span>}
              </div>
              <textarea
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder="Paste text or drag PDF here..."
                className="w-full h-48 p-4 bg-transparent resize-none focus:outline-none text-sm text-slate-600"
              />
            </div>

            <div className="border-2 border-slate-200 rounded-xl bg-white p-1">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <label className="flex items-center gap-2 font-bold text-slate-700">
                  <Briefcase className="w-5 h-5 text-purple-600" />
                  Job Description
                </label>
              </div>
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste job requirements here..."
                className="w-full h-48 p-4 bg-transparent resize-none focus:outline-none text-sm text-slate-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
               <button onClick={() => { setResumeText('Sample Resume...'); setJobDescription('Sample Job...'); setFileName('Sample.txt'); }} className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl flex items-center justify-center gap-2 transition-colors">
                  <Wand className="w-4 h-4" /> Auto-Fill
               </button>
               <button onClick={() => fileInputRef.current?.click()} className="px-4 py-3 bg-white border-2 border-blue-100 hover:border-blue-300 text-blue-600 font-bold rounded-xl flex items-center justify-center gap-2 transition-colors">
                  <Upload className="w-4 h-4" /> Upload PDF
               </button>
               <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf,.txt" className="hidden" />
            </div>

            <button onClick={analyzeResume} disabled={loading} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-200 transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-lg">
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Search className="w-5 h-5" />}
              {loading ? 'Analyzing...' : 'Run Analysis'}
            </button>
          </div>

          {/* Results Section */}
          <div className="lg:col-span-7">
            {!result ? (
              <div className="h-full flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-200 rounded-2xl bg-white text-center min-h-[500px]">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                  <Target className="w-10 h-10 text-slate-300" />
                </div>
                <h3 className="text-xl font-bold text-slate-600 mb-2">Ready to Analyze</h3>
                <p className="text-slate-500">Upload your documents to unlock AI insights.</p>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="bg-white rounded-2xl p-8 border border-slate-100 shadow-xl flex items-center gap-8">
                  <div className="relative w-32 h-32 flex-shrink-0">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="64" cy="64" r="56" stroke="#f1f5f9" strokeWidth="12" fill="transparent" />
                      <circle cx="64" cy="64" r="56" stroke={result.matchScore > 75 ? '#22c55e' : result.matchScore > 50 ? '#eab308' : '#ef4444'} strokeWidth="12" fill="transparent" strokeDasharray={351} strokeDashoffset={351 - (351 * result.matchScore) / 100} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-3xl font-black text-slate-800">{result.matchScore}%</div>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-800 mb-2">Analysis Result</h2>
                    <p className="text-slate-600">{result.summary}</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                   <div className="bg-white p-6 rounded-xl border-l-4 border-green-500 shadow-sm">
                      <div className="flex items-center gap-2 mb-4 font-bold text-slate-800"><CheckCircle className="w-5 h-5 text-green-500"/> Strengths</div>
                      <ul className="space-y-2">{result.strengths.map((s,i)=><li key={i} className="text-sm text-slate-600 flex gap-2"><span className="w-1.5 h-1.5 bg-green-500 rounded-full mt-1.5 flex-shrink-0"></span>{s}</li>)}</ul>
                   </div>
                   <div className="bg-white p-6 rounded-xl border-l-4 border-yellow-500 shadow-sm">
                      <div className="flex items-center gap-2 mb-4 font-bold text-slate-800"><TrendingUp className="w-5 h-5 text-yellow-500"/> Improvements</div>
                      <ul className="space-y-2">{result.improvements.map((s,i)=><li key={i} className="text-sm text-slate-600 flex gap-2"><span className="w-1.5 h-1.5 bg-yellow-500 rounded-full mt-1.5 flex-shrink-0"></span>{s}</li>)}</ul>
                   </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* --- PROFESSIONAL FOOTER --- */}
      <footer className="bg-slate-900 text-slate-300 py-12 mt-auto">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          
          <div className="text-center md:text-left">
            <h3 className="text-lg font-bold text-white mb-1">Developed by</h3>
            <p className="text-xl font-black bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
              R NITHYANANDACHARI
            </p>
            <a href="mailto:nviswaks@gmail.com" className="inline-flex items-center gap-2 mt-3 text-sm hover:text-white transition-colors">
              <Mail className="w-4 h-4" /> nviswaks@gmail.com
            </a>
          </div>

          <div className="flex items-center gap-4">
            <a 
              href="https://www.linkedin.com/in/nithyanana" 
              target="_blank" 
              rel="noreferrer"
              className="p-3 bg-slate-800 rounded-full hover:bg-[#0077b5] hover:text-white transition-all transform hover:-translate-y-1"
              aria-label="LinkedIn"
            >
              <Linkedin className="w-5 h-5" />
            </a>
            <a 
              href="https://github.com/Nithyaviswak" 
              target="_blank" 
              rel="noreferrer"
              className="p-3 bg-slate-800 rounded-full hover:bg-black hover:text-white transition-all transform hover:-translate-y-1"
              aria-label="GitHub"
            >
              <Github className="w-5 h-5" />
            </a>
          </div>
          
        </div>
        <div className="text-center text-xs text-slate-600 mt-8 pt-8 border-t border-slate-800 mx-6">
          © {new Date().getFullYear()} ATSPro. All rights reserved.
        </div>
      </footer>

    </div>
  );
};

export default App;