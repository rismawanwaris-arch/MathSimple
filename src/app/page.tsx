'use client';

import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  Timer,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Flag,
  Settings,
  BookOpen,
  Users,
  Sparkles,
  Download,
  Plus,
  Edit2,
  Trash2,
  Copy,
  Check,
  RotateCcw,
  Shield,
  Layers,
  HelpCircle,
  Lock,
  LogOut,
  EyeOff,
} from 'lucide-react';
import { Question, ExamSettings, ExamSession } from '@/types';
import { defaultQuestions } from '@/data/defaultQuestions';

export default function Home() {
  // Views: 'intro' | 'exam' | 'result' | 'admin'
  const [activeView, setActiveView] = useState<'intro' | 'exam' | 'result' | 'admin'>('intro');
  const [adminTab, setAdminTab] = useState<'scores' | 'questions' | 'settings' | 'ai'>('scores');

  // Exam Configuration & Sanitized Questions (Zero answer leakage!)
  const [examSettings, setExamSettings] = useState<ExamSettings>({
    duration_minutes: 15,
    autosubmit: true,
    warning_minutes: 2,
  });
  
  // Strip out answers from default fallback questions immediately for client safety
  const safeDefaultQuestions = defaultQuestions.map((q) => ({
    ...q,
    correct_answer: '', // sanitized
  }));
  const [questions, setQuestions] = useState<Question[]>(safeDefaultQuestions);

  // Participant & Active Session State
  const [fullName, setFullName] = useState('');
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<number[]>([]);
  const [timeLeft, setTimeLeft] = useState(examSettings.duration_minutes * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [examStartTime, setExamStartTime] = useState<string>('');
  const [tabSwitchCount, setTabSwitchCount] = useState<number>(0);
  const [submissionReference, setSubmissionReference] = useState('');
  const [submissionSavedToDb, setSubmissionSavedToDb] = useState<boolean | null>(null);
  const [submissionDbWarning, setSubmissionDbWarning] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Admin Authentication & Session State
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [adminAuthError, setAdminAuthError] = useState('');
  const [isAdminAuthModalOpen, setIsAdminAuthModalOpen] = useState(false);
  const [adminSessions, setAdminSessions] = useState<ExamSession[]>([]);
  const [adminQuestionsWithKeys, setAdminQuestionsWithKeys] = useState<Question[]>([]);
  const [adminDebugInfo, setAdminDebugInfo] = useState<{
    isConfigured?: boolean;
    hasUrl?: boolean;
    urlPreview?: string;
    hasAnonKey?: boolean;
    hasServiceRoleKey?: boolean;
    error?: string;
    exception?: string;
  } | null>(null);
  const [adminWarning, setAdminWarning] = useState<string | null>(null);
  const [isLoadingAdminData, setIsLoadingAdminData] = useState(false);

  // Question CRUD Modal State
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null);
  const [modalFormData, setModalFormData] = useState<Partial<Question>>({
    difficulty: 'Mudah',
    category: 'Pertambahan',
    question_type: 'mcq',
    question_text: '',
    options: ['', '', '', ''],
    correct_answer: '',
  });

  // AI Prompt State
  const [copiedTemplate, setCopiedTemplate] = useState<string | null>(null);
  const [aiJsonInput, setAiJsonInput] = useState('');

  // Timer Ref
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Fetch Sanitized Questions & Public Settings from Secure API on Mount
  useEffect(() => {
    async function loadPublicData() {
      try {
        const res = await fetch('/api/questions', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.questions && data.questions.length > 0) {
            setQuestions(data.questions);
          }
        }
      } catch (err) {
        console.warn('Menggunakan fallback data lokal yang telah disanitasi.');
      }
    }
    loadPublicData();
  }, []);

  // 2. Anti-Cheat: Detect Tab Switching / Focus Loss
  useEffect(() => {
    if (activeView !== 'exam' || !isTimerRunning) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabSwitchCount((prev) => prev + 1);
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault(); // Prevent right-click copying during exam
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [activeView, isTimerRunning]);

  // 3. Countdown Timer Effect
  useEffect(() => {
    if (isTimerRunning && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current as NodeJS.Timeout);
            handleAutoSubmit();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerRunning, timeLeft]);

  // Format Timer MM:SS
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(remainingSecs).padStart(2, '0')}`;
  };

  // Start Exam
  const handleStartExam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;

    setUserAnswers({});
    setFlaggedQuestions([]);
    setCurrentQIndex(0);
    setTabSwitchCount(0);
    const startIso = new Date().toISOString();
    setExamStartTime(startIso);
    setTimeLeft(examSettings.duration_minutes * 60);
    setIsTimerRunning(true);
    setActiveView('exam');
  };

  // Select MCQ Answer
  const handleSelectAnswer = (qId: number, answer: string) => {
    setUserAnswers((prev) => ({
      ...prev,
      [qId]: answer,
    }));
  };

  // Toggle Flag Question
  const handleToggleFlag = (qId: number) => {
    setFlaggedQuestions((prev) =>
      prev.includes(qId) ? prev.filter((id) => id !== qId) : [...prev, qId]
    );
  };

  // Submit Exam (Handled by Server-Side Evaluation API)
  const handleAutoSubmit = () => {
    alert('⏱️ Waktu ujian telah habis! Jawaban Anda otomatis dikirimkan ke server.');
    handleSubmitExam();
  };

  const handleConfirmSubmit = () => {
    const answeredCount = Object.keys(userAnswers).length;
    const unanswered = questions.length - answeredCount;
    const flaggedCount = flaggedQuestions.length;

    let message = `Konfirmasi Kumpulkan Ujian:\n\n- Terjawab: ${answeredCount} dari ${questions.length} soal\n- Belum Dijawab: ${unanswered} soal\n- Ditandai Ragu-ragu: ${flaggedCount} soal`;
    if (tabSwitchCount > 0) {
      message += `\n- Peringatan: Terdeteksi ${tabSwitchCount}x berpindah tab/jendela.`;
    }
    message += `\n\nApakah Anda yakin ingin menyelesaikan ujian sekarang?`;

    if (window.confirm(message)) {
      handleSubmitExam();
    }
  };

  const handleSubmitExam = async () => {
    setIsSubmitting(true);
    setIsTimerRunning(false);

    try {
      // POST answers to Server-Side grading endpoint
      const response = await fetch('/api/submit-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          answers: userAnswers,
          startedAt: examStartTime || new Date().toISOString(),
          tabSwitchCount,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setSubmissionReference(result.referenceCode);
        setSubmissionSavedToDb(result.savedToSupabase ?? false);
        setSubmissionDbWarning(result.dbWarning || null);
      } else {
        // Fallback reference code
        setSubmissionReference(`SUBMIT-${Math.floor(1000 + Math.random() * 9000)}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`);
        setSubmissionSavedToDb(false);
        setSubmissionDbWarning(result.error || 'Gagal menyimpan ke database');
      }
    } catch (err: any) {
      setSubmissionReference(`SUBMIT-OFFLINE-${Math.floor(1000 + Math.random() * 9000)}`);
      setSubmissionSavedToDb(false);
      setSubmissionDbWarning('Koneksi jaringan terputus saat pengiriman');
    }

    setIsSubmitting(false);
    setActiveView('result');

    // Celebration confetti
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch {
      // Fallback safe
    }
  };

  // Admin PIN Authentication Handlers
  const handleOpenAdmin = () => {
    if (isAdminAuthenticated) {
      setActiveView('admin');
      loadAdminDashboardData();
    } else {
      setAdminAuthError('');
      setAdminPinInput('');
      setIsAdminAuthModalOpen(true);
    }
  };

  const handleVerifyAdminPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminAuthError('');

    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: adminPinInput }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsAdminAuthenticated(true);
        setIsAdminAuthModalOpen(false);
        setActiveView('admin');
        loadAdminDashboardData();
      } else {
        setAdminAuthError(data.error || 'PIN yang Anda masukkan salah.');
      }
    } catch {
      setAdminAuthError('Gagal menghubungkan ke server autentikasi.');
    }
  };

  const handleAdminLogout = async () => {
    await fetch('/api/admin/auth', { method: 'DELETE' });
    setIsAdminAuthenticated(false);
    setActiveView('intro');
  };

  // Load Admin Data (Sessions, Full Questions with Keys, Settings)
  const loadAdminDashboardData = async () => {
    setIsLoadingAdminData(true);
    try {
      // 1. Load Sessions
      const sessRes = await fetch('/api/admin/sessions', { cache: 'no-store' });
      if (sessRes.ok) {
        const sData = await sessRes.json();
        setAdminSessions(sData.sessions || []);
        setAdminDebugInfo(sData.debug || null);
        setAdminWarning(sData.warning || null);
      } else {
        const errData = await sessRes.json().catch(() => ({}));
        setAdminWarning(errData.error || 'Gagal memuat sesi ujian dari server.');
      }

      // 2. Load Full Questions (Admin only)
      const qRes = await fetch('/api/admin/questions', { cache: 'no-store' });
      if (qRes.ok) {
        const qData = await qRes.json();
        setAdminQuestionsWithKeys(qData.questions || []);
      }

      // 3. Load Settings
      const setRes = await fetch('/api/admin/settings', { cache: 'no-store' });
      if (setRes.ok) {
        const setData = await setRes.json();
        if (setData.settings) {
          setExamSettings({
            duration_minutes: setData.settings.duration_minutes || 15,
            autosubmit: setData.settings.autosubmit ?? true,
            warning_minutes: setData.settings.warning_minutes || 2,
          });
          setTimeLeft((setData.settings.duration_minutes || 15) * 60);
        }
      }
    } catch (err: any) {
      console.error('Error loading admin dashboard data:', err);
      setAdminWarning(err.message || 'Gagal terhubung ke server.');
    } finally {
      setIsLoadingAdminData(false);
    }
  };

  // Duration Setting Update (Admin only)
  const handleUpdateDuration = async (minutes: number) => {
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration_minutes: minutes }),
      });

      if (res.ok) {
        setExamSettings((prev) => ({ ...prev, duration_minutes: minutes }));
        setTimeLeft(minutes * 60);
        alert(`✅ Batas waktu ujian berhasil diperbarui menjadi ${minutes} Menit!`);
      } else {
        alert('Gagal memperbarui waktu di server.');
      }
    } catch {
      alert('Terjadi kesalahan jaringan.');
    }
  };

  // Question CRUD Operations (Admin only)
  const handleOpenAddQuestion = () => {
    setEditingQuestionIndex(null);
    setModalFormData({
      question_order: (adminQuestionsWithKeys.length || questions.length) + 1,
      difficulty: 'Mudah',
      category: 'Pertambahan',
      question_type: 'mcq',
      question_text: '',
      options: ['', '', '', ''],
      correct_answer: '',
      points: 10,
    });
    setIsQuestionModalOpen(true);
  };

  const handleOpenEditQuestion = (index: number) => {
    const list = adminQuestionsWithKeys.length > 0 ? adminQuestionsWithKeys : questions;
    const q = list[index];
    setEditingQuestionIndex(index);
    setModalFormData({
      id: q.id,
      question_order: q.question_order,
      difficulty: q.difficulty,
      category: q.category,
      question_type: q.question_type,
      question_text: q.question_text,
      options: q.options ? [...q.options] : ['', '', '', ''],
      correct_answer: q.correct_answer || '',
      points: q.points || 10,
    });
    setIsQuestionModalOpen(true);
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalFormData.question_text || !modalFormData.correct_answer) {
      alert('Harap lengkapi teks pertanyaan dan kunci jawaban.');
      return;
    }

    const updatedQ: Question = {
      id: modalFormData.id || Date.now(),
      question_order: modalFormData.question_order || 1,
      difficulty: modalFormData.difficulty || 'Mudah',
      category: modalFormData.category || 'Pertambahan',
      question_type: modalFormData.question_type || 'mcq',
      question_text: modalFormData.question_text,
      options: modalFormData.question_type === 'mcq' ? modalFormData.options : null,
      correct_answer: modalFormData.correct_answer,
      points: 10,
    };

    try {
      const method = editingQuestionIndex !== null ? 'PUT' : 'POST';
      const res = await fetch('/api/admin/questions', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: updatedQ }),
      });

      if (res.ok) {
        setIsQuestionModalOpen(false);
        loadAdminDashboardData();
        alert('✅ Soal berhasil disimpan ke database!');
      } else {
        alert('Gagal menyimpan soal.');
      }
    } catch {
      alert('Terjadi kesalahan jaringan.');
    }
  };

  const handleDeleteQuestion = async (index: number) => {
    const list = adminQuestionsWithKeys.length > 0 ? adminQuestionsWithKeys : questions;
    const q = list[index];
    if (!window.confirm(`Hapus butir soal No. ${index + 1}?`)) return;

    try {
      const res = await fetch(`/api/admin/questions?id=${q.id}`, { method: 'DELETE' });
      if (res.ok) {
        loadAdminDashboardData();
        alert('✅ Soal berhasil dihapus.');
      }
    } catch {
      alert('Gagal menghapus soal.');
    }
  };

  // AI Import JSON (Admin only)
  const handleImportJson = async () => {
    try {
      const parsed = JSON.parse(aiJsonInput.trim());
      if (Array.isArray(parsed) && parsed.length > 0) {
        const formatted: Question[] = parsed.map((item, idx) => ({
          id: item.id || idx + 1,
          question_order: item.question_order || idx + 1,
          difficulty: item.difficulty || 'Mudah',
          category: item.category || 'Pertambahan',
          question_type: item.question_type || 'mcq',
          question_text: item.question_text || '',
          options: item.options || null,
          correct_answer: item.correct_answer || '',
          points: 10,
        }));

        const res = await fetch('/api/admin/questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questions: formatted }),
        });

        if (res.ok) {
          setAiJsonInput('');
          loadAdminDashboardData();
          alert(`🎉 Sukses mengimpor ${formatted.length} butir soal baru ke Bank Soal!`);
          setAdminTab('questions');
        } else {
          alert('Gagal menyimpan paket soal ke server.');
        }
      } else {
        alert('Format JSON harus berupa array berisi kumpulan objek soal.');
      }
    } catch (err: any) {
      alert('Format JSON tidak valid: ' + err.message);
    }
  };

  // Copy Prompt Helper
  const handleCopyPrompt = (text: string, templateKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTemplate(templateKey);
    setTimeout(() => setCopiedTemplate(null), 2500);
  };

  // Delete a specific session
  const handleDeleteSession = async (sessionId?: string, participantName?: string) => {
    if (!sessionId) {
      alert('ID sesi tidak valid.');
      return;
    }
    const name = participantName || 'Peserta';
    if (!window.confirm(`Apakah Anda yakin ingin menghapus data ujian peserta "${name}"? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/sessions?id=${sessionId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAdminSessions((prev) => prev.filter((s) => s.id !== sessionId));
        alert(`✅ Data ujian peserta "${name}" berhasil dihapus.`);
      } else {
        alert(data.error || 'Gagal menghapus data.');
      }
    } catch {
      alert('Terjadi kesalahan saat menghubungi server.');
    }
  };

  // Delete all sessions
  const handleDeleteAllSessions = async () => {
    if (adminSessions.length === 0) {
      alert('Tidak ada data ujian yang tersimpan untuk dihapus.');
      return;
    }

    if (!window.confirm(`⚠️ PERINGATAN: Apakah Anda yakin ingin MENGHAPUS SEMUA (${adminSessions.length}) data hasil ujian karyawan?\n\nSeluruh data peserta, skor, dan rekaman jawaban akan dihapus secara permanen.`)) {
      return;
    }

    try {
      const res = await fetch('/api/admin/sessions?all=true', {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAdminSessions([]);
        alert('✅ Seluruh data hasil ujian berhasil dihapus.');
      } else {
        alert(data.error || 'Gagal menghapus data.');
      }
    } catch {
      alert('Terjadi kesalahan saat menghubungi server.');
    }
  };

  // Export CSV (Admin only)
  const handleExportCSV = () => {
    const headers = ['ID Sesi', 'Nama Karyawan', 'Waktu Mulai', 'Durasi Setting', 'Benar', 'Total Soal', 'Skor Akhir', 'Perpindahan Tab'];
    const rows = adminSessions.map((s) => [
      s.id,
      `"${s.participant_name}"`,
      new Date(s.started_at).toLocaleString('id-ID'),
      `${s.time_limit_minutes} Menit`,
      s.total_correct,
      questions.length,
      s.total_score,
      s.tab_switch_count || 0,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `rekap_nilai_matematika_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Current Question
  const currentQ = questions[currentQIndex] || questions[0];
  const isLastQuestion = currentQIndex === questions.length - 1;
  const answeredCount = Object.keys(userAnswers).length;
  const progressPercent = Math.round((answeredCount / (questions.length || 1)) * 100);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-3 md:p-6 transition-colors select-none">
      {/* TOP BAR / NAVIGATION */}
      <header className="max-w-6xl mx-auto mb-6 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-xl shadow-md">
            ∑
          </div>
          <div>
            <h1 className="text-base md:text-lg font-bold tracking-tight">MathSimple Employee Assessment</h1>
            <p className="text-xs text-[var(--muted)]">Sistem Asesmen Matematika & Ketelitian Karyawan (Hardened & Protected)</p>
          </div>
        </div>

        {/* View Switchers */}
        <div className="flex items-center gap-1.5 bg-[var(--background)] p-1 rounded-xl border border-[var(--border)] text-xs font-medium">
          <button
            onClick={() => setActiveView('intro')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeView === 'intro' ? 'bg-[var(--card)] text-blue-600 font-bold shadow-xs' : 'text-[var(--muted)] hover:text-[var(--foreground)]'
            }`}
          >
            Form Peserta
          </button>
          <button
            onClick={() => {
              if (fullName) setActiveView('exam');
              else alert('Silakan masukkan Nama Lengkap terlebih dahulu.');
            }}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
              activeView === 'exam' ? 'bg-[var(--card)] text-blue-600 font-bold shadow-xs' : 'text-[var(--muted)] hover:text-[var(--foreground)]'
            }`}
          >
            <Timer className="w-3.5 h-3.5" />
            Ujian ({examSettings.duration_minutes}m)
          </button>
          <button
            onClick={handleOpenAdmin}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
              activeView === 'admin' ? 'bg-[var(--card)] text-purple-600 font-bold shadow-xs' : 'text-[var(--muted)] hover:text-[var(--foreground)]'
            }`}
          >
            <Lock className="w-3.5 h-3.5 text-purple-600" />
            Dashboard HR
          </button>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-6xl mx-auto">
        {/* ========================================================================= */}
        {/* VIEW 1: INTRO / REGISTRATION FORM (HANYA NAMA)                           */}
        {/* ========================================================================= */}
        {activeView === 'intro' && (
          <section className="max-w-xl mx-auto bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 md:p-8 shadow-sm">
            <div className="text-center mb-6">
              <span className="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 mb-2">
                Asesmen Matematika & Ketelitian
              </span>
              <h2 className="text-xl md:text-2xl font-bold">Ujian Hitung & Nilai Nominal</h2>
              <p className="text-sm text-[var(--muted)] mt-1">Harap masukkan nama lengkap Anda sebelum memulai pengerjaan tes.</p>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-3 gap-3 p-3.5 mb-6 rounded-2xl bg-[var(--background)] border border-[var(--border)] text-center text-xs">
              <div>
                <span className="text-[var(--muted)] block mb-0.5">Jumlah Soal</span>
                <strong className="text-sm font-semibold">{questions.length} Butir</strong>
              </div>
              <div className="border-x border-[var(--border)]">
                <span className="text-[var(--muted)] block mb-0.5">Batas Waktu</span>
                <strong className="text-sm font-semibold text-red-500">{examSettings.duration_minutes} Menit</strong>
              </div>
              <div>
                <span className="text-[var(--muted)] block mb-0.5">Format</span>
                <strong className="text-sm font-semibold text-blue-600">Pilihan & Isian</strong>
              </div>
            </div>

            {/* Rules Checklist */}
            <div className="p-4 mb-6 rounded-2xl bg-[var(--background)] border border-[var(--border)] space-y-2 text-xs">
              <div className="font-semibold mb-1 flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-blue-600" /> Ketentuan Pengerjaan:
              </div>
              <div className="flex items-start gap-2 text-[var(--muted)]">
                <span className="text-blue-600 font-bold">•</span>
                <span><strong>Soal Hitungan:</strong> Pilihan ganda (A, B, C, D) untuk operasi pertambahan & pengurangan.</span>
              </div>
              <div className="flex items-start gap-2 text-[var(--muted)]">
                <span className="text-blue-600 font-bold">•</span>
                <span><strong>Soal Nominal & Terbilang:</strong> Isian singkat untuk penulisan rupiah (contoh: <code>Rp 75.000</code>) dan kalimat terbilang.</span>
              </div>
              <div className="flex items-start gap-2 text-[var(--muted)]">
                <span className="text-blue-600 font-bold">•</span>
                <span><strong>Sistem Pengawasan:</strong> Perpindahan tab browser terdeteksi otomatis oleh sistem pengawas HR.</span>
              </div>
            </div>

            {/* FORM HANYA NAMA */}
            <form onSubmit={handleStartExam} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5">Nama Lengkap Peserta</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ketikkan nama lengkap Anda..."
                  className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--background)] text-base font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
                <p className="text-[11px] text-[var(--muted)] mt-1.5">Cukup masukkan nama Anda untuk memulai ujian.</p>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow transition-all flex items-center justify-center gap-2"
              >
                Mulai Ujian Sekarang ({examSettings.duration_minutes} Menit)
                <ChevronRight className="w-4 h-4" />
              </button>
            </form>
          </section>
        )}

        {/* ========================================================================= */}
        {/* VIEW 2: EXAM PANEL (HARDENED ANTI-CHEAT)                                */}
        {/* ========================================================================= */}
        {activeView === 'exam' && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Column: Active Question (8 cols) */}
            <div className="lg:col-span-8 space-y-4">
              {/* Header Status Bar */}
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg ${
                      currentQ.difficulty === 'Mudah'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : currentQ.difficulty === 'Menengah'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                        : 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
                    }`}
                  >
                    {currentQ.difficulty} (Level {currentQ.difficulty === 'Mudah' ? '1' : currentQ.difficulty === 'Menengah' ? '2' : '3'})
                  </span>
                  <span className="px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                    {currentQ.category}
                  </span>
                  {tabSwitchCount > 0 && (
                    <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-600" />
                      Pindah Tab: {tabSwitchCount}x
                    </span>
                  )}
                </div>

                {/* Countdown Timer */}
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border font-mono font-bold text-sm ${
                    timeLeft <= 120
                      ? 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400 animate-pulse'
                      : 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400'
                  }`}
                >
                  <Timer className="w-4 h-4" />
                  <span>{formatTime(timeLeft)}</span>
                </div>
              </div>

              {/* Question Card */}
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 md:p-8 shadow-sm">
                <div className="flex items-center justify-between pb-4 border-b border-[var(--border)] mb-6">
                  <span className="text-sm font-semibold text-[var(--muted)]">
                    Soal No. <span className="text-lg text-[var(--foreground)] font-bold">{currentQIndex + 1}</span> dari {questions.length}
                  </span>
                  <span className="text-xs text-[var(--muted)]">Bobot: 10 Poin</span>
                </div>

                {/* Question Text */}
                <div className="mb-6">
                  <p className="text-base md:text-lg font-medium leading-relaxed">{currentQ.question_text}</p>
                </div>

                {/* Answer Inputs: MCQ vs Text Input */}
                <div className="space-y-3">
                  {currentQ.question_type === 'mcq' && currentQ.options ? (
                    <div className="space-y-2.5">
                      {currentQ.options.map((opt, optIdx) => {
                        const letters = ['A', 'B', 'C', 'D'];
                        const isSelected = userAnswers[currentQ.id] === opt;
                        return (
                          <button
                            key={optIdx}
                            onClick={() => handleSelectAnswer(currentQ.id, opt)}
                            className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center justify-between text-sm ${
                              isSelected
                                ? 'border-blue-600 bg-blue-500/10 font-semibold text-blue-600 dark:text-blue-400 shadow-xs ring-1 ring-blue-500'
                                : 'border-[var(--border)] hover:bg-[var(--background)] text-[var(--foreground)]'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                                  isSelected ? 'bg-blue-600 text-white' : 'bg-[var(--background)] border border-[var(--border)]'
                                }`}
                              >
                                {letters[optIdx]}
                              </span>
                              <span>{opt}</span>
                            </div>
                            <span
                              className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] text-white ${
                                isSelected ? 'border-blue-600 bg-blue-600' : 'border-gray-400'
                              }`}
                            >
                              {isSelected ? '✓' : ''}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-[var(--muted)]">
                        Ketikkan jawaban Anda dengan teliti:
                      </label>
                      <input
                        type="text"
                        value={userAnswers[currentQ.id] || ''}
                        onChange={(e) => handleSelectAnswer(currentQ.id, e.target.value)}
                        placeholder="Ketik jawaban nominal / terbilang di sini..."
                        className="w-full px-4 py-3.5 text-base rounded-2xl border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                      />
                      <p className="text-[11px] text-[var(--muted)] italic">
                        Perhatikan tanda baca, ejaan kata, dan pemisah ribuan (contoh: <code>Rp 75.000</code>).
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-6 mt-8 border-t border-[var(--border)]">
                  <button
                    onClick={() => setCurrentQIndex((prev) => Math.max(0, prev - 1))}
                    disabled={currentQIndex === 0}
                    className="px-4 py-2 text-xs font-medium rounded-xl border border-[var(--border)] hover:bg-[var(--background)] disabled:opacity-40 transition-all flex items-center gap-1"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Sebelumnya
                  </button>

                  <button
                    onClick={() => handleToggleFlag(currentQ.id)}
                    className={`px-4 py-2 text-xs font-medium rounded-xl border transition-all flex items-center gap-1.5 ${
                      flaggedQuestions.includes(currentQ.id)
                        ? 'bg-amber-500/20 border-amber-500 text-amber-600 dark:text-amber-400 font-bold'
                        : 'border-amber-500/40 text-amber-600 hover:bg-amber-500/10'
                    }`}
                  >
                    <Flag className="w-3.5 h-3.5" /> Ragu-ragu
                  </button>

                  {isLastQuestion ? (
                    <button
                      onClick={handleConfirmSubmit}
                      disabled={isSubmitting}
                      className="px-5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow transition-all flex items-center gap-1"
                    >
                      <Check className="w-4 h-4" /> Selesai & Kumpulkan
                    </button>
                  ) : (
                    <button
                      onClick={() => setCurrentQIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                      className="px-5 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow transition-all flex items-center gap-1"
                    >
                      Selanjutnya <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-[var(--muted)]">Progres Pengerjaan</span>
                  <span className="font-semibold text-blue-600">
                    {answeredCount} dari {questions.length} Soal Terjawab ({progressPercent}%)
                  </span>
                </div>
                <div className="w-full bg-[var(--background)] h-2 rounded-full overflow-hidden border border-[var(--border)]">
                  <div className="bg-blue-600 h-full rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
            </div>

            {/* Right Column: Question Navigator 1-30 (4 cols) */}
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-5 shadow-sm sticky top-6">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] mb-4">
                  <h3 className="font-bold text-sm">Navigasi Soal</h3>
                  <span className="text-xs text-[var(--muted)]">{questions.length} Butir</span>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-2 text-xs mb-4">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-blue-600"></span> Dijawab
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-amber-500"></span> Ragu
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-[var(--background)] border border-[var(--border)]"></span> Kosong
                  </div>
                </div>

                {/* Grid Numbers */}
                <div className="grid grid-cols-5 gap-2 text-xs font-semibold mb-6">
                  {questions.map((q, idx) => {
                    const hasAnswer = userAnswers[q.id] !== undefined && userAnswers[q.id].trim() !== '';
                    const isFlagged = flaggedQuestions.includes(q.id);
                    const isCurrent = idx === currentQIndex;

                    let btnClass = 'h-9 w-full rounded-xl border flex items-center justify-center transition-all cursor-pointer ';
                    if (isCurrent) btnClass += 'ring-2 ring-blue-500 font-bold ';

                    if (isFlagged) {
                      btnClass += 'bg-amber-500 text-white border-amber-600';
                    } else if (hasAnswer) {
                      btnClass += 'bg-blue-600 text-white border-blue-700';
                    } else {
                      btnClass += 'bg-[var(--background)] border-[var(--border)] text-[var(--foreground)] hover:border-blue-400';
                    }

                    return (
                      <button key={q.id} onClick={() => setCurrentQIndex(idx)} className={btnClass}>
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>

                {/* Finish Exam */}
                <button
                  onClick={handleConfirmSubmit}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow transition-all flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" /> Kumpulkan Jawaban
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ========================================================================= */}
        {/* VIEW 3: CONFIRMATION / RECEIPT (ZERO LEAKAGE)                           */}
        {/* ========================================================================= */}
        {activeView === 'result' && (
          <section className="max-w-xl mx-auto bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 md:p-8 shadow-sm text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 flex items-center justify-center text-3xl mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold">Ujian Selesai & Berhasil Dikirim!</h2>
            <p className="text-sm text-[var(--muted)] mt-2">
              Terima kasih telah menyelesaikan seluruh rangkaian tes ketelitian matematika. Jawaban Anda telah tersimpan dan dievaluasi dengan aman di server HR.
            </p>

            {/* Receipt Card */}
            <div className="my-6 p-5 rounded-2xl bg-[var(--background)] border border-[var(--border)] text-left text-xs space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-[var(--border)]">
                <span className="text-[var(--muted)]">Nomor Bukti Pengiriman</span>
                <span className="font-mono font-bold text-blue-600">{submissionReference}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Nama Lengkap Peserta</span>
                <span className="font-semibold text-blue-600">{fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Batas Waktu Ujian</span>
                <span className="font-semibold">{examSettings.duration_minutes} Menit</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--muted)]">Status Penilaian</span>
                {submissionSavedToDb === true ? (
                  <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-semibold text-xs flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Tersimpan di Supabase
                  </span>
                ) : submissionSavedToDb === false ? (
                  <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-semibold text-xs flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Server-Graded (Database Belum Terhubung)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-semibold">
                    Tersimpan di Server
                  </span>
                )}
              </div>
              {submissionDbWarning && (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-300 space-y-0.5">
                  <span className="font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> Info Database:
                  </span>
                  <p>{submissionDbWarning}</p>
                </div>
              )}
            </div>

            <div className="p-3.5 mb-6 rounded-xl bg-gray-500/10 border border-gray-500/20 text-xs text-[var(--muted)]">
              <strong>Catatan:</strong> Nilai akhir dan analisis evaluasi tes bersifat rahasia perusahaan dan hanya dapat diakses oleh tim HRD.
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setFullName('');
                  setActiveView('intro');
                }}
                className="flex-1 py-2.5 px-4 border border-[var(--border)] hover:bg-[var(--background)] text-xs rounded-xl font-medium transition-all"
              >
                Kembali ke Halaman Depan
              </button>
              <button
                onClick={handleOpenAdmin}
                className="py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-xl shadow transition-all flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" /> Akses HR Admin
              </button>
            </div>
          </section>
        )}

        {/* ========================================================================= */}
        {/* VIEW 4: PROTECTED HR ADMIN DASHBOARD                                     */}
        {/* ========================================================================= */}
        {activeView === 'admin' && isAdminAuthenticated && (
          <section className="space-y-6">
            {/* Admin Header & Tabs */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                  HR Admin Center
                </span>
                <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5" /> Terotentikasi Aman
                </span>
              </div>

              {/* Subtabs & Logout */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="flex items-center gap-1 bg-[var(--background)] p-1 rounded-xl border border-[var(--border)] text-xs font-medium">
                  <button
                    onClick={() => setAdminTab('scores')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      adminTab === 'scores' ? 'bg-[var(--card)] text-[var(--foreground)] font-bold shadow-xs' : 'text-[var(--muted)]'
                    }`}
                  >
                    📊 Rekap Nilai
                  </button>
                  <button
                    onClick={() => setAdminTab('questions')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      adminTab === 'questions' ? 'bg-[var(--card)] text-[var(--foreground)] font-bold shadow-xs' : 'text-[var(--muted)]'
                    }`}
                  >
                    📝 Bank Soal ({adminQuestionsWithKeys.length || questions.length})
                  </button>
                  <button
                    onClick={() => setAdminTab('settings')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      adminTab === 'settings' ? 'bg-[var(--card)] text-[var(--foreground)] font-bold shadow-xs' : 'text-[var(--muted)]'
                    }`}
                  >
                    ⏱️ Atur Waktu Ujian
                  </button>
                  <button
                    onClick={() => setAdminTab('ai')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      adminTab === 'ai' ? 'bg-[var(--card)] text-[var(--foreground)] font-bold shadow-xs' : 'text-[var(--muted)]'
                    }`}
                  >
                    🤖 AI Prompting
                  </button>
                </div>

                <button
                  onClick={handleAdminLogout}
                  className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all"
                >
                  <LogOut className="w-3.5 h-3.5" /> Logout
                </button>
              </div>
            </div>

            {/* SUBTAB 1: REKAP SKOR */}
            {adminTab === 'scores' && (
              <div className="space-y-6">
                {/* Supabase Connection Diagnostics Card */}
                {adminWarning ? (
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 font-bold text-sm text-amber-800 dark:text-amber-300">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                          <span>Status Database Supabase Perlu Dikonfigurasi</span>
                        </div>
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          {adminWarning}
                        </p>
                        {adminDebugInfo && (
                          <div className="mt-2 pt-2 border-t border-amber-500/20 text-[11px] grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <span className="text-[var(--muted)]">NEXT_PUBLIC_SUPABASE_URL: </span>
                              <strong className={adminDebugInfo.hasUrl ? 'text-emerald-600' : 'text-red-500'}>
                                {adminDebugInfo.hasUrl ? `Terdeteksi (${adminDebugInfo.urlPreview})` : 'Belum Terisi di Vercel'}
                              </strong>
                            </div>
                            <div>
                              <span className="text-[var(--muted)]">SUPABASE_SERVICE_ROLE_KEY: </span>
                              <strong className={adminDebugInfo.hasServiceRoleKey ? 'text-emerald-600' : 'text-red-500'}>
                                {adminDebugInfo.hasServiceRoleKey ? 'Terpasang' : (adminDebugInfo.hasAnonKey ? 'Menggunakan Anon Key' : 'Belum Terisi')}
                              </strong>
                            </div>
                          </div>
                        )}
                        <div className="mt-2.5 text-xs bg-[var(--card)] p-3 rounded-xl border border-[var(--border)] text-[var(--foreground)] space-y-1">
                          <strong className="block text-[11px] font-semibold text-blue-600">Langkah Penyelesaian:</strong>
                          <ol className="list-decimal list-inside text-[11px] space-y-1 text-[var(--muted)]">
                            <li>Jika sudah mengisi Environment Variables di Vercel: Buka menu <strong>Deployments</strong> di Vercel → klik titik tiga (<code>...</code>) di kanan atas deployment terbaru → klik <strong>Redeploy</strong>.</li>
                            <li>Buka Supabase Console → menu <strong>SQL Editor</strong> → buka / tempel isi file <code>supabase/schema.sql</code> → klik tombol <strong>Run</strong> untuk membuat tabel database.</li>
                          </ol>
                        </div>
                      </div>
                      <button
                        onClick={loadAdminDashboardData}
                        disabled={isLoadingAdminData}
                        className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-all flex-shrink-0 shadow cursor-pointer disabled:opacity-50"
                      >
                        <RotateCcw className={`w-3.5 h-3.5 ${isLoadingAdminData ? 'animate-spin' : ''}`} />
                        <span>Cek Ulang</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300 shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span className="font-semibold">Koneksi Database Supabase Terhubung Aktif</span>
                      {adminDebugInfo?.urlPreview && (
                        <span className="text-[11px] text-[var(--muted)]">({adminDebugInfo.urlPreview})</span>
                      )}
                    </div>
                    <button
                      onClick={loadAdminDashboardData}
                      disabled={isLoadingAdminData}
                      className="px-2.5 py-1 rounded-lg border border-emerald-500/30 hover:bg-emerald-500/20 font-medium flex items-center gap-1 cursor-pointer transition-all disabled:opacity-50"
                    >
                      <RotateCcw className={`w-3 h-3 ${isLoadingAdminData ? 'animate-spin' : ''}`} />
                      <span>Refresh</span>
                    </button>
                  </div>
                )}

                {/* Metric Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-sm">
                    <span className="text-xs text-[var(--muted)]">Total Peserta Selesai</span>
                    <div className="text-2xl font-extrabold mt-1">{adminSessions.length}</div>
                    <span className="text-[11px] text-emerald-600 font-medium">Server-Graded</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-sm">
                    <span className="text-xs text-[var(--muted)]">Rata-rata Skor</span>
                    <div className="text-2xl font-extrabold mt-1 text-blue-600">
                      {adminSessions.length > 0
                        ? (adminSessions.reduce((acc, s) => acc + s.total_score, 0) / adminSessions.length).toFixed(1)
                        : '0.0'}
                    </div>
                    <span className="text-[11px] text-blue-600 font-medium">Skala 100</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-sm">
                    <span className="text-xs text-[var(--muted)]">Tingkat Lolos (≥ 75)</span>
                    <div className="text-2xl font-extrabold mt-1 text-emerald-600">
                      {adminSessions.length > 0
                        ? `${Math.round((adminSessions.filter((s) => s.total_score >= 75).length / adminSessions.length) * 100)}%`
                        : '0%'}
                    </div>
                    <span className="text-[11px] text-emerald-600 font-medium">Standar HR</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-sm">
                    <span className="text-xs text-[var(--muted)]">Durasi Ujian Aktif</span>
                    <div className="text-2xl font-extrabold mt-1 text-red-500">{examSettings.duration_minutes} Menit</div>
                    <span className="text-[11px] text-[var(--muted)]">Tersimpan di Supabase</span>
                  </div>
                </div>

                {/* Leaderboard Table */}
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-5 shadow-sm">
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-[var(--border)] flex-wrap gap-2">
                    <h3 className="font-bold text-sm">Daftar Hasil Ujian Karyawan</h3>
                    <div className="flex items-center gap-2">
                      {adminSessions.length > 0 && (
                        <button
                          onClick={handleDeleteAllSessions}
                          className="px-3 py-1.5 rounded-xl border border-red-300 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                          title="Hapus seluruh data hasil ujian"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Hapus Semua
                        </button>
                      )}
                      <button
                        onClick={handleExportCSV}
                        className="px-3 py-1.5 rounded-xl border border-[var(--border)] hover:bg-[var(--background)] text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" /> Unduh CSV
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[var(--background)] font-semibold text-[var(--muted)]">
                        <tr>
                          <th className="p-3">ID Sesi</th>
                          <th className="p-3">Nama Karyawan</th>
                          <th className="p-3">Waktu Selesai</th>
                          <th className="p-3">Pindah Tab</th>
                          <th className="p-3">Benar / Total</th>
                          <th className="p-3">Skor Akhir</th>
                          <th className="p-3">Status</th>
                          <th className="p-3 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {adminSessions.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="p-4 text-center text-[var(--muted)]">
                              Belum ada data pengerjaan ujian yang tersimpan.
                            </td>
                          </tr>
                        ) : (
                          adminSessions.map((s, idx) => (
                            <tr key={idx} className="hover:bg-[var(--background)] transition-colors">
                              <td className="p-3 font-mono text-[var(--muted)]">{s.id?.slice(0, 12) || 'SESS-0'}</td>
                              <td className="p-3 font-semibold text-[var(--foreground)]">{s.participant_name}</td>
                              <td className="p-3 text-[var(--muted)]">
                                {new Date(s.finished_at || s.started_at).toLocaleTimeString('id-ID', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </td>
                              <td className="p-3 font-mono">
                                {(s.tab_switch_count || 0) > 0 ? (
                                  <span className="text-amber-600 font-bold">{s.tab_switch_count}x</span>
                                ) : (
                                  <span className="text-emerald-600">0x (Jujur)</span>
                                )}
                              </td>
                              <td className="p-3 text-emerald-600 font-medium">
                                {s.total_correct} / {questions.length}
                              </td>
                              <td className="p-3 font-bold text-base text-blue-600">{s.total_score}</td>
                              <td className="p-3">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                    s.total_score >= 75
                                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                  }`}
                                >
                                  {s.total_score >= 75 ? 'Lulus' : 'Remedial'}
                                </span>
                              </td>
                              <td className="p-3 text-right">
                                <button
                                  onClick={() => handleDeleteSession(s.id, s.participant_name)}
                                  className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1 font-medium text-xs"
                                  title={`Hapus data ${s.participant_name}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">Hapus</span>
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* SUBTAB 2: BANK SOAL (CRUD DENGAN KUNCI JAWABAN - ADMIN ONLY) */}
            {adminTab === 'questions' && (
              <div className="space-y-6">
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                  <div>
                    <h3 className="font-bold text-sm">Daftar Bank Soal & Kunci Jawaban</h3>
                    <p className="text-xs text-[var(--muted)]">Kelola butir soal. Kunci jawaban di sini terlindungi di server dan tidak pernah dikirim ke peserta.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleOpenAddQuestion}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs shadow flex items-center gap-1.5 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" /> Input Soal Baru
                    </button>
                    <button
                      onClick={() => setAdminTab('ai')}
                      className="px-3.5 py-1.5 border border-purple-500/40 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 font-medium rounded-xl text-xs flex items-center gap-1.5 transition-all"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Generate via AI
                    </button>
                  </div>
                </div>

                <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-5 shadow-sm">
                  <div className="overflow-x-auto rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[var(--background)] font-semibold text-[var(--muted)]">
                        <tr>
                          <th className="p-3 w-12 text-center">No</th>
                          <th className="p-3 w-24">Level</th>
                          <th className="p-3 w-36">Kategori</th>
                          <th className="p-3 w-28">Tipe Soal</th>
                          <th className="p-3">Pertanyaan</th>
                          <th className="p-3 w-40">Kunci Jawaban</th>
                          <th className="p-3 w-28 text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {(adminQuestionsWithKeys.length > 0 ? adminQuestionsWithKeys : questions).map((q, idx) => (
                          <tr key={idx} className="hover:bg-[var(--background)] transition-colors">
                            <td className="p-3 text-center font-bold font-mono">{idx + 1}</td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  q.difficulty === 'Mudah'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : q.difficulty === 'Menengah'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-purple-100 text-purple-800'
                                }`}
                              >
                                {q.difficulty}
                              </span>
                            </td>
                            <td className="p-3 font-medium">{q.category}</td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] ${
                                  q.question_type === 'mcq' ? 'bg-gray-100 text-gray-700' : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {q.question_type === 'mcq' ? 'Pilihan Ganda' : 'Isian Singkat'}
                              </span>
                            </td>
                            <td className="p-3 max-w-xs truncate">{q.question_text}</td>
                            <td className="p-3 font-semibold text-emerald-600">{q.correct_answer || '(Terproteksi di Server)'}</td>
                            <td className="p-3 text-center">
                              <button
                                onClick={() => handleOpenEditQuestion(idx)}
                                className="px-2 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-semibold mr-1"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteQuestion(idx)}
                                className="px-2 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-semibold"
                              >
                                Hapus
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* SUBTAB 3: ATUR WAKTU UJIAN */}
            {adminTab === 'settings' && (
              <div className="max-w-xl mx-auto bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 md:p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[var(--border)]">
                  <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center text-2xl font-bold">
                    ⏱️
                  </div>
                  <div>
                    <h3 className="text-base font-bold">Pengaturan Durasi Waktu Ujian</h3>
                    <p className="text-xs text-[var(--muted)]">Tentukan batas waktu pengerjaan 30 butir soal untuk seluruh peserta.</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-semibold mb-2">Pilih Durasi Waktu Standar</label>
                    <div className="grid grid-cols-4 gap-2.5">
                      {[10, 15, 20, 30].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => handleUpdateDuration(mins)}
                          className={`p-3 rounded-xl border text-center transition-all text-xs ${
                            examSettings.duration_minutes === mins
                              ? 'border-blue-600 bg-blue-500/10 text-blue-600 font-bold ring-1 ring-blue-500'
                              : 'border-[var(--border)] hover:bg-[var(--background)]'
                          }`}
                        >
                          <span className="block font-bold text-sm">{mins} Menit</span>
                          <span className="text-[10px] text-[var(--muted)]">
                            {mins === 15 ? '(Rekomendasi)' : `${Math.round((mins * 60) / 30)} dtk/soal`}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-[var(--background)] border border-[var(--border)] space-y-2 text-xs">
                    <span className="font-semibold block text-[var(--foreground)]">Pengaturan Auto-Submit:</span>
                    <p className="text-[var(--muted)]">
                      Sistem akan langsung mengunci lembar jawaban dan menyimpannya secara otomatis ketika timer mencapai <code>00:00</code>.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* SUBTAB 4: AI PROMPTING */}
            {adminTab === 'ai' && (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
                <div className="flex items-center gap-3 pb-4 border-b border-[var(--border)]">
                  <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-600 flex items-center justify-center text-2xl font-bold">
                    🤖
                  </div>
                  <div>
                    <h3 className="text-base font-bold">AI Prompt Generator untuk Update Soal</h3>
                    <p className="text-xs text-[var(--muted)]">
                      Salin prompt di bawah ini ke ChatGPT / Gemini / Claude untuk menghasilkan paket soal baru secara instan.
                    </p>
                  </div>
                </div>

                {/* Box Prompt 30 Soal */}
                <div className="p-5 rounded-2xl bg-[var(--background)] border border-[var(--border)] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-blue-600">PROMPT TEMPLATE: GENERATE 30 SOAL BARU (JSON)</span>
                    <button
                      onClick={() =>
                        handleCopyPrompt(
                          `Bertindaklah sebagai Senior HR Assessor & Pembuat Soal Tes Matematika Bisnis. 
Saya membutuhkan paket 30 butir soal tes matematika dan ketelitian nominal karyawan untuk aplikasi asesmen dengan spesifikasi:
- 10 Soal Level Mudah (Soal 1-10): Pertambahan dasar, pengurangan dasar, penulisan nominal puluhan/ratusan ribu rupiah.
- 10 Soal Level Menengah (Soal 11-20): Hitungan multi-digit ribuan, kembalian kas, penulisan nominal jutaan rupiah, konversi terbilang.
- 10 Soal Level Sulit (Soal 21-30): Operasi hitung campuran (+ dan - beruntun), rekonsiliasi kas, penulisan nominal puluhan/ratusan juta rupiah.
FORMAT JAWABAN:
- Soal hitungan (+/-): MCQ (Pilihan Ganda A, B, C, D) dengan options array dan correct_answer.
- Soal nominal & terbilang: INPUT (Isian singkat) dengan correct_answer format baku seperti 'Rp 75.000' atau kalimat terbilang.
Berikan HANYA output format JSON array valid:
[
  {
    "question_order": 1,
    "difficulty": "Mudah",
    "category": "Pertambahan",
    "question_type": "mcq",
    "question_text": "...",
    "options": ["A", "B", "C", "D"],
    "correct_answer": "..."
  }
]`,
                          'template-30'
                        )
                      }
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-xs shadow flex items-center gap-1 transition-all"
                    >
                      {copiedTemplate === 'template-30' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedTemplate === 'template-30' ? 'Tersalin!' : 'Salin Prompt'}
                    </button>
                  </div>
                  <p className="text-xs text-[var(--muted)]">
                    Salin teks prompt ini, buka AI chat, dan tempelkan. AI akan menyusun 30 butir soal lengkap dengan kunci jawaban.
                  </p>
                </div>

                {/* Import Box */}
                <div className="p-5 rounded-2xl bg-blue-500/5 border border-blue-500/20 space-y-3">
                  <span className="font-bold text-xs text-blue-700 dark:text-blue-300">
                    📥 Tempel (Paste) Output JSON dari AI ke Kotak di Bawah:
                  </span>
                  <textarea
                    rows={4}
                    value={aiJsonInput}
                    onChange={(e) => setAiJsonInput(e.target.value)}
                    placeholder="Tempelkan teks JSON array soal dari ChatGPT/Gemini di sini..."
                    className="w-full font-mono text-xs p-3 rounded-xl bg-[var(--card)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleImportJson}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs shadow flex items-center gap-1.5 transition-all"
                  >
                    <Check className="w-3.5 h-3.5" /> Terapkan ke Bank Soal
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* ========================================================================= */}
      {/* MODAL 1: ADMIN PIN AUTHENTICATION                                         */}
      {/* ========================================================================= */}
      {isAdminAuthModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center mb-4">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg mb-1">Akses Pengawas HRD</h3>
            <p className="text-xs text-[var(--muted)] mb-4">
              Masukkan PIN Admin untuk mengakses rekap nilai dan bank soal.
            </p>

            <form onSubmit={handleVerifyAdminPin} className="space-y-4">
              <div>
                <input
                  type="password"
                  autoFocus
                  required
                  maxLength={12}
                  value={adminPinInput}
                  onChange={(e) => setAdminPinInput(e.target.value)}
                  placeholder="Masukkan PIN (Default: 889922)"
                  className="w-full text-center tracking-widest text-lg font-mono p-3 rounded-xl border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                {adminAuthError && (
                  <p className="text-xs text-red-500 font-semibold mt-1.5">{adminAuthError}</p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsAdminAuthModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-[var(--border)] hover:bg-[var(--background)] text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs shadow"
                >
                  Buka Dashboard
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: INPUT / EDIT QUESTION                                            */}
      {/* ========================================================================= */}
      {isQuestionModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] mb-4">
              <h3 className="font-bold text-base">
                {editingQuestionIndex !== null ? `Edit Butir Soal No. ${editingQuestionIndex + 1}` : 'Input Butir Soal Baru'}
              </h3>
              <button
                onClick={() => setIsQuestionModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-[var(--background)] flex items-center justify-center text-lg"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveQuestion} className="space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Nomor Urut</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    required
                    value={modalFormData.question_order || 1}
                    onChange={(e) => setModalFormData({ ...modalFormData, question_order: parseInt(e.target.value, 10) })}
                    className="w-full p-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)] font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Tingkat Kesulitan</label>
                  <select
                    value={modalFormData.difficulty}
                    onChange={(e) => setModalFormData({ ...modalFormData, difficulty: e.target.value as any })}
                    className="w-full p-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)]"
                  >
                    <option value="Mudah">Mudah (Level 1)</option>
                    <option value="Menengah">Menengah (Level 2)</option>
                    <option value="Sulit">Sulit (Level 3)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Kategori</label>
                  <select
                    value={modalFormData.category}
                    onChange={(e) => setModalFormData({ ...modalFormData, category: e.target.value as any })}
                    className="w-full p-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)]"
                  >
                    <option value="Pertambahan">Pertambahan</option>
                    <option value="Pengurangan">Pengurangan</option>
                    <option value="Penulisan Nominal">Penulisan Nominal</option>
                    <option value="Penyebutan Nominal">Penyebutan Nominal</option>
                    <option value="Operasi Campuran">Operasi Campuran</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Tipe Jawaban</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="q-type"
                      checked={modalFormData.question_type === 'mcq'}
                      onChange={() => setModalFormData({ ...modalFormData, question_type: 'mcq' })}
                    />
                    <span>Pilihan Ganda (A, B, C, D)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="q-type"
                      checked={modalFormData.question_type === 'input'}
                      onChange={() => setModalFormData({ ...modalFormData, question_type: 'input' })}
                    />
                    <span>Isian Singkat (Text Input)</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Teks Pertanyaan</label>
                <textarea
                  rows={3}
                  required
                  value={modalFormData.question_text || ''}
                  onChange={(e) => setModalFormData({ ...modalFormData, question_text: e.target.value })}
                  placeholder="Tuliskan teks pertanyaan di sini..."
                  className="w-full p-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)]"
                />
              </div>

              {/* Options if MCQ */}
              {modalFormData.question_type === 'mcq' && (
                <div className="space-y-2 p-3 rounded-2xl bg-[var(--background)] border border-[var(--border)]">
                  <label className="block font-semibold mb-1">Pilihan Jawaban (A, B, C, D):</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['A', 'B', 'C', 'D'].map((letter, optIdx) => (
                      <div key={letter} className="flex items-center gap-1.5">
                        <span className="w-5 font-bold text-center">{letter}</span>
                        <input
                          type="text"
                          value={modalFormData.options?.[optIdx] || ''}
                          onChange={(e) => {
                            const newOpts = [...(modalFormData.options || ['', '', '', ''])];
                            newOpts[optIdx] = e.target.value;
                            setModalFormData({ ...modalFormData, options: newOpts });
                          }}
                          placeholder={`Pilihan ${letter}`}
                          className="w-full p-2 rounded-lg border border-[var(--border)] bg-[var(--card)]"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold mb-1">Kunci Jawaban Benar (Server Only)</label>
                <input
                  type="text"
                  required
                  value={modalFormData.correct_answer || ''}
                  onChange={(e) => setModalFormData({ ...modalFormData, correct_answer: e.target.value })}
                  placeholder="Ketik teks jawaban yang benar persis..."
                  className="w-full p-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)] font-medium"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setIsQuestionModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[var(--border)] hover:bg-[var(--background)]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow"
                >
                  Simpan Soal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
