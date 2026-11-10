-- =========================================================================
-- DATABASE SCHEMA & HARDENED SECURITY (ROW LEVEL SECURITY)
-- Platform: Supabase (PostgreSQL)
-- =========================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Drop existing tables (HANYA AKTIFKAN JIKA INGIN MERESET TOTAL DARI NOL)
-- PERHATIAN: Baris di bawah dinonaktifkan agar tidak menghapus riwayat peserta dan sesi ujian yang sudah ada!
-- DROP TABLE IF EXISTS exam_answers CASCADE;
-- DROP TABLE IF EXISTS exam_sessions CASCADE;
-- DROP TABLE IF EXISTS questions CASCADE;
-- DROP TABLE IF EXISTS participants CASCADE;
-- DROP TABLE IF EXISTS exam_settings CASCADE;

-- =========================================================================
-- TABLE DEFINITIONS (NON-DESTRUCTIVE / PRESERVES HISTORICAL DATA)
-- =========================================================================

-- 1. Settings Tabel (Durasi Waktu Ujian Global)
CREATE TABLE IF NOT EXISTS exam_settings (
    id SERIAL PRIMARY KEY,
    duration_minutes INT DEFAULT 15,
    autosubmit BOOLEAN DEFAULT TRUE,
    warning_minutes INT DEFAULT 2,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO exam_settings (id, duration_minutes, autosubmit, warning_minutes)
VALUES (1, 15, TRUE, 2)
ON CONFLICT (id) DO NOTHING;

-- 2. Peserta Ujian (Hanya Nama Lengkap)
CREATE TABLE IF NOT EXISTS participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(150) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Bank Soal (30 Butir Soal Bergradasi)
CREATE TABLE IF NOT EXISTS questions (
    id SERIAL PRIMARY KEY,
    question_order INT UNIQUE NOT NULL,
    category VARCHAR(50) NOT NULL,      -- 'Pertambahan', 'Pengurangan', 'Penulisan Nominal', 'Penyebutan Nominal', 'Operasi Campuran'
    difficulty VARCHAR(20) NOT NULL,    -- 'Mudah', 'Menengah', 'Sulit'
    question_type VARCHAR(20) NOT NULL, -- 'mcq' (Pilihan Ganda) atau 'input' (Isian Singkat)
    question_text TEXT NOT NULL,
    options JSONB,                      -- Array ["A", "B", "C", "D"] jika type = 'mcq'
    correct_answer TEXT NOT NULL,       -- Teks kunci jawaban (HANYA DIAKSES OLEH SERVER)
    points INT DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pastikan indeks unik question_order ada jika tabel sudah terlanjur dibuat tanpa UNIQUE
CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_order ON questions (question_order);

-- 4. Sesi Ujian (Exam Sessions - Immutable)
CREATE TABLE IF NOT EXISTS exam_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID REFERENCES participants(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    time_limit_minutes INT DEFAULT 15,
    total_score NUMERIC(5,2) DEFAULT 0,
    total_correct INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'in_progress', -- 'in_progress', 'completed', 'timed_out'
    tab_switch_count INT DEFAULT 0
);

-- 5. Jawaban Peserta per Soal (Immutable)
CREATE TABLE IF NOT EXISTS exam_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES exam_sessions(id) ON DELETE CASCADE,
    question_id INT REFERENCES questions(id) ON DELETE CASCADE,
    submitted_answer TEXT,
    is_correct BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- SEED DATA: 30 BUTIR SOAL MATEMATIKA & NOMINAL
-- =========================================================================

INSERT INTO questions (question_order, difficulty, category, question_type, question_text, options, correct_answer) VALUES
-- LEVEL 1: MUDAH (Soal 1 s/d 10) - Konter Pulsa & Tarik Tunai Dasar
(1, 'Mudah', 'Pertambahan', 'mcq', 'Pelanggan ingin tarik tunai sebesar Rp 100.000 via Transfer. Sesuai tabel tarif konter (Rp 10.000 - Rp 200.000 admin Rp 3.000), berapakah total nominal yang harus ditransfer pelanggan?', '["Rp 103.000", "Rp 105.000", "Rp 102.500", "Rp 100.000"]'::jsonb, 'Rp 103.000'),
(2, 'Mudah', 'Pengurangan', 'mcq', 'Pelanggan membeli pulsa reguler Rp 20.000 seharga Rp 22.000 dan membayar tunai dengan 1 lembar uang Rp 50.000. Berapakah uang kembalian yang harus diberikan kasir?', '["Rp 28.000", "Rp 38.000", "Rp 27.000", "Rp 32.000"]'::jsonb, 'Rp 28.000'),
(3, 'Mudah', 'Penulisan Nominal', 'input', 'Pelanggan ingin tarik tunai via transfer sebesar: "Seratus lima puluh ribu rupiah". Ketikkan penulisan nominal angka tersebut (contoh: 150.000):', null, '150.000'),
(4, 'Mudah', 'Penyebutan Nominal', 'input', 'Kasir mengonfirmasi struk tarik tunai dengan nominal 350.000. Ketikkan kalimat terbilang dari nominal angka tersebut:', null, 'Tiga ratus lima puluh ribu rupiah'),
(5, 'Mudah', 'Pertambahan', 'mcq', 'Pelanggan melakukan tarik tunai via QRIS sebesar Rp 300.000. Berdasarkan tarif admin QRIS (Rp 200.001 - Rp 500.000 admin Rp 5.000), berapakah total saldo yang harus di-scan oleh pelanggan?', '["Rp 305.000", "Rp 303.000", "Rp 310.000", "Rp 302.500"]'::jsonb, 'Rp 305.000'),
(6, 'Mudah', 'Pengurangan', 'mcq', 'Kasir memiliki uang kas fisik awal Rp 500.000 di laci. Seorang pelanggan menarik tunai Rp 150.000 setelah berhasil transfer. Berapakah sisa uang tunai fisik di laci kasir?', '["Rp 350.000", "Rp 347.000", "Rp 353.000", "Rp 450.000"]'::jsonb, 'Rp 350.000'),
(7, 'Mudah', 'Penulisan Nominal', 'input', 'Ketikkan nominal angka untuk transaksi tarik tunai: "Satu juta rupiah" (contoh: 1.000.000):', null, '1.000.000'),
(8, 'Mudah', 'Penyebutan Nominal', 'input', 'Sebelum menyerahkan uang tunai Rp 75.000 kepada pelanggan, kasir wajib menyebutkan nominalnya. Ketikkan kalimat terbilang dari Rp 75.000:', null, 'Tujuh puluh lima ribu rupiah'),
(9, 'Mudah', 'Operasi Campuran', 'mcq', 'Pelanggan membeli pulsa Rp 12.000 dan token PLN Rp 23.000. Pelanggan membayar dengan 1 lembar uang Rp 50.000. Berapakah uang kembalian yang harus diberikan kasir?', '["Rp 15.000", "Rp 25.000", "Rp 12.000", "Rp 18.000"]'::jsonb, 'Rp 15.000'),
(10, 'Mudah', 'Pertambahan', 'mcq', 'Pelanggan tarik tunai via Transfer Rp 50.000 (admin Rp 3.000) dan membeli pulsa Rp 12.000. Berapakah total uang yang harus dibayar/ditransfer oleh pelanggan?', '["Rp 65.000", "Rp 63.000", "Rp 62.000", "Rp 68.000"]'::jsonb, 'Rp 65.000'),

-- LEVEL 2: MENENGAH (Soal 11 s/d 20) - Transaksi Multi-Item & Perbandingan Admin
(11, 'Menengah', 'Pertambahan', 'mcq', 'Pelanggan ingin tarik tunai via Transfer sebesar Rp 2.500.000 ke rekening konter BCA A/N ASYA BISNIS INDONESIA. Sesuai tabel tarif (Rp 200.001 - Rp 5.000.000 admin Rp 5.000), berapakah total nominal yang harus ditransfer?', '["Rp 2.505.000 (Admin Rp 5.000)", "Rp 2.510.000 (Admin Rp 10.000)", "Rp 2.503.000 (Admin Rp 3.000)", "Rp 2.520.000 (Admin Rp 20.000)"]'::jsonb, 'Rp 2.505.000 (Admin Rp 5.000)'),
(12, 'Menengah', 'Pengurangan', 'mcq', 'Pelanggan tarik tunai via QRIS sebesar Rp 800.000 (admin Rp 10.000). Pelanggan membayar tunai biaya admin dengan 1 lembar uang Rp 50.000. Berapakah uang kembalian biaya admin yang harus diserahkan kasir?', '["Rp 40.000", "Rp 45.000", "Rp 35.000", "Rp 30.000"]'::jsonb, 'Rp 40.000'),
(13, 'Menengah', 'Penulisan Nominal', 'input', 'Pelanggan mengirimkan bukti transfer tarik tunai sebesar: "Dua juta tujuh ratus lima puluh ribu rupiah". Ketikkan angka nominal tersebut (contoh: 2.750.000):', null, '2.750.000'),
(14, 'Menengah', 'Penyebutan Nominal', 'input', 'Kasir memverifikasi mutasi masuk di rekening Mandiri A/N SYAIFUL sebesar Rp 1.250.000. Ketikkan kalimat terbilang dari nominal Rp 1.250.000:', null, 'Satu juta dua ratus lima puluh ribu rupiah'),
(15, 'Menengah', 'Operasi Campuran', 'mcq', 'Pelanggan tarik tunai Rp 1.200.000 via QRIS (admin tarif Rp 1.000.001 - Rp 1.500.000 adalah Rp 15.000) dan membeli paket data seharga Rp 85.000. Berapakah total scan QRIS jika semua digabung?', '["Rp 1.300.000", "Rp 1.295.000", "Rp 1.310.000", "Rp 1.285.000"]'::jsonb, 'Rp 1.300.000'),
(16, 'Menengah', 'Pertambahan', 'mcq', 'Pelanggan tarik tunai via Transfer sebesar Rp 7.500.000 ke rekening BRI A/N SYAIFUL. Sesuai tabel tarif (Rp 5.000.001 - Rp 10.000.000), berapa admin yang dikenakan dan total transfernya?', '["Rp 7.510.000 (Admin Rp 10.000)", "Rp 7.505.000 (Admin Rp 5.000)", "Rp 7.515.000 (Admin Rp 15.000)", "Rp 7.520.000 (Admin Rp 20.000)"]'::jsonb, 'Rp 7.510.000 (Admin Rp 10.000)'),
(17, 'Menengah', 'Pengurangan', 'mcq', 'Kasir memulai shift dengan modal kas fisik Rp 8.000.000. Terjadi 3 kali transaksi penarikan tunai: Rp 1.000.000, Rp 2.500.000, dan Rp 1.500.000. Berapakah sisa saldo kas fisik di laci kasir?', '["Rp 3.000.000", "Rp 3.500.000", "Rp 2.500.000", "Rp 4.000.000"]'::jsonb, 'Rp 3.000.000'),
(18, 'Menengah', 'Operasi Campuran', 'mcq', 'Pelanggan membandingkan: Tarik tunai Rp 1.500.000 lebih hemat menggunakan metode Transfer atau QRIS, dan berapa selisih biayanya berdasarkan tabel?', '["Lebih hemat Transfer (selisih Rp 10.000)", "Lebih hemat QRIS (selisih Rp 5.000)", "Biaya keduanya sama", "Lebih hemat Transfer (selisih Rp 5.000)"]'::jsonb, 'Lebih hemat Transfer (selisih Rp 10.000)'),
(19, 'Menengah', 'Penulisan Nominal', 'input', 'Ketikkan penulisan angka dari transaksi tarik tunai: "Empat juta delapan ratus ribu rupiah" (contoh: 4.800.000):', null, '4.800.000'),
(20, 'Menengah', 'Penyebutan Nominal', 'input', 'Seorang pelanggan mentransfer Rp 3.450.000 untuk tarik tunai. Ketikkan kalimat terbilang dari nominal Rp 3.450.000:', null, 'Tiga juta empat ratus lima puluh ribu rupiah'),

-- LEVEL 3: SULIT (Soal 21 s/d 30) - Rekapitulasi Kasir, Kasus Pecahan & Transaksi Besar
(21, 'Sulit', 'Pertambahan', 'mcq', 'Pelanggan tarik tunai via Transfer sebesar Rp 15.000.000. Sesuai tabel tarif nominal Rp 10.000.001 - Rp 20.000.000, berapakah biaya admin dan total yang harus ditransfer?', '["Rp 15.020.000 (Admin Rp 20.000)", "Rp 15.010.000 (Admin Rp 10.000)", "Rp 15.025.000 (Admin Rp 25.000)", "Rp 15.015.000 (Admin Rp 15.000)"]'::jsonb, 'Rp 15.020.000 (Admin Rp 20.000)'),
(22, 'Sulit', 'Operasi Campuran', 'mcq', 'Dalam satu sesi shift, kasir melayani tarik tunai via Transfer: 2x nominal Rp 100.000 (admin Rp 3.000), 3x nominal Rp 1.000.000 (admin Rp 5.000), dan 1x nominal Rp 6.000.000 (admin Rp 10.000). Berapakah total pemasukan biaya admin konter?', '["Rp 31.000", "Rp 28.000", "Rp 35.000", "Rp 25.000"]'::jsonb, 'Rp 31.000'),
(23, 'Sulit', 'Pengurangan', 'mcq', 'Kas fisik awal Rp 12.000.000. Hari ini ada penarikan via Transfer: Rp 4.500.000 (admin Rp 5.000 dibayar tunai) dan Rp 5.500.000 (admin Rp 10.000 dibayar tunai). Jika biaya admin tunai langsung masuk laci, berapa total uang fisik di laci kasir sekarang?', '["Rp 2.015.000", "Rp 2.000.000", "Rp 1.985.000", "Rp 2.010.000"]'::jsonb, 'Rp 2.015.000'),
(24, 'Sulit', 'Penulisan Nominal', 'input', 'Seorang pedagang melakukan tarik tunai via Transfer: "Dua puluh lima juta lima ratus ribu rupiah". Ketikkan nominal angka tersebut (contoh: 25.500.000):', null, '25.500.000'),
(25, 'Sulit', 'Penyebutan Nominal', 'input', 'Transaksi penarikan limit tertinggi di poster konter adalah Rp 50.000.000 (admin Rp 25.000). Ketikkan kalimat terbilang dari nominal angka Rp 50.000.000:', null, 'Lima puluh juta rupiah'),
(26, 'Sulit', 'Operasi Campuran', 'mcq', 'Pelanggan tarik tunai Rp 1.800.000 via QRIS (admin Rp 20.000). Pelanggan men-scan total Rp 1.820.000 dan meminta uang tunai dalam pecahan lembaran Rp 50.000. Berapa lembar uang Rp 50.000 yang harus diserahkan kasir?', '["36 lembar", "38 lembar", "34 lembar", "40 lembar"]'::jsonb, '36 lembar'),
(27, 'Sulit', 'Operasi Campuran', 'mcq', 'Pelanggan tarik tunai Rp 22.000.000 via Transfer (tarif Rp 20.000.001 - Rp 50.000.000 admin Rp 25.000) dan membeli 2 voucher data masing-masing Rp 65.000. Pelanggan mentransfer total sebesar Rp 22.155.000. Apakah nominal transfer tersebut sudah tepat?', '["Tepat, Rp 22.155.000", "Kurang Rp 10.000", "Lebih Rp 10.000", "Kurang Rp 25.000"]'::jsonb, 'Tepat, Rp 22.155.000'),
(28, 'Sulit', 'Operasi Campuran', 'mcq', 'Pelanggan ingin tarik tunai Rp 2.500.000. Karena limit QRIS di konter maksimal Rp 2.000.000, kasir menyarankan via Transfer ke BCA A/N ASYA BISNIS INDONESIA. Berapa biaya admin via Transfer untuk nominal Rp 2.500.000 sesuai tabel?', '["Rp 5.000", "Rp 10.000", "Rp 15.000", "Rp 20.000"]'::jsonb, 'Rp 5.000'),
(29, 'Sulit', 'Operasi Campuran', 'mcq', 'Pada rekap malam jam 21:30 (tutup transfer), kasir merekap tarik tunai via QRIS: 3x Rp 200.000 (admin Rp 3.000), 2x Rp 500.000 (admin Rp 5.000), dan 2x Rp 1.000.000 (admin Rp 10.000). Berapa total uang tunai yang keluar dan total admin yang diperoleh?', '["Tarik Tunai Rp 3.600.000, Total Admin Rp 39.000", "Tarik Tunai Rp 3.600.000, Total Admin Rp 35.000", "Tarik Tunai Rp 3.500.000, Total Admin Rp 39.000", "Tarik Tunai Rp 3.700.000, Total Admin Rp 45.000"]'::jsonb, 'Tarik Tunai Rp 3.600.000, Total Admin Rp 39.000'),
(30, 'Sulit', 'Operasi Campuran', 'mcq', 'Kasir menerima komplain: Pelanggan tarik tunai via Transfer Rp 6.000.000 dan dikenakan admin Rp 10.000. Pelanggan merasa seharusnya adminnya Rp 5.000. Berdasarkan tabel tarif resmi konter, bagaimana keputusannya?', '["Benar, karena Rp 6.000.000 masuk rentang Rp 5.000.001 - Rp 10.000.000 (Admin Rp 10.000)", "Salah, seharusnya Rp 5.000", "Salah, seharusnya Rp 15.000", "Salah, seharusnya Rp 20.000"]'::jsonb, 'Benar, karena Rp 6.000.000 masuk rentang Rp 5.000.001 - Rp 10.000.000 (Admin Rp 10.000)')
ON CONFLICT (question_order) DO UPDATE SET
    difficulty = EXCLUDED.difficulty,
    category = EXCLUDED.category,
    question_type = EXCLUDED.question_type,
    question_text = EXCLUDED.question_text,
    options = EXCLUDED.options,
    correct_answer = EXCLUDED.correct_answer;

-- =========================================================================
-- HARDENED ROW LEVEL SECURITY (DEFAULT DENY UNTUK anon/authenticated)
-- Akses data hanya lewat server Next.js dengan service_role (bypass RLS).
-- Jangan menambah policy untuk anon: anon key bersifat publik di browser.
-- =========================================================================
ALTER TABLE exam_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_answers  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON exam_settings, participants, questions, exam_sessions, exam_answers FROM anon, authenticated;
GRANT ALL ON exam_settings, participants, questions, exam_sessions, exam_answers TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
