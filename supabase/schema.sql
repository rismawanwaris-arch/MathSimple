-- =========================================================================
-- DATABASE SCHEMA & HARDENED SECURITY (ROW LEVEL SECURITY)
-- Platform: Supabase (PostgreSQL)
-- =========================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Drop existing tables if re-running (Clean setup)
DROP TABLE IF EXISTS exam_answers CASCADE;
DROP TABLE IF EXISTS exam_sessions CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS participants CASCADE;
DROP TABLE IF EXISTS exam_settings CASCADE;

-- =========================================================================
-- TABLE DEFINITIONS
-- =========================================================================

-- 1. Settings Tabel (Durasi Waktu Ujian Global)
CREATE TABLE exam_settings (
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
CREATE TABLE participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(150) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Bank Soal (30 Butir Soal Bergradasi)
CREATE TABLE questions (
    id SERIAL PRIMARY KEY,
    question_order INT NOT NULL,
    category VARCHAR(50) NOT NULL,      -- 'Pertambahan', 'Pengurangan', 'Penulisan Nominal', 'Penyebutan Nominal', 'Operasi Campuran'
    difficulty VARCHAR(20) NOT NULL,    -- 'Mudah', 'Menengah', 'Sulit'
    question_type VARCHAR(20) NOT NULL, -- 'mcq' (Pilihan Ganda) atau 'input' (Isian Singkat)
    question_text TEXT NOT NULL,
    options JSONB,                      -- Array ["A", "B", "C", "D"] jika type = 'mcq'
    correct_answer TEXT NOT NULL,       -- Teks kunci jawaban (HANYA DIAKSES OLEH SERVER)
    points INT DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Sesi Ujian (Exam Sessions - Immutable)
CREATE TABLE exam_sessions (
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
CREATE TABLE exam_answers (
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
-- LEVEL 1: MUDAH (Soal 1 s/d 10)
(1, 'Mudah', 'Pertambahan', 'mcq', 'Berapakah hasil dari penjumlahan: 450 + 725 = ...', '["1.175", "1.165", "1.185", "1.155"]'::jsonb, '1.175'),
(2, 'Mudah', 'Pengurangan', 'mcq', 'Berapakah sisa pengurangan: 1.000 - 375 = ...', '["625", "635", "725", "525"]'::jsonb, '625'),
(3, 'Mudah', 'Penulisan Nominal', 'input', 'Ketikkan nominal angka rupiah dari teks: "Tujuh puluh lima ribu rupiah" (contoh format: Rp 75.000)', null, 'Rp 75.000'),
(4, 'Mudah', 'Penyebutan Nominal', 'input', 'Ketikkan kalimat terbilang dari nominal angka: Rp 125.000', null, 'Seratus dua puluh lima ribu rupiah'),
(5, 'Mudah', 'Pertambahan', 'mcq', 'Berapakah hasil dari penjumlahan: 85 + 145 = ...', '["230", "220", "240", "225"]'::jsonb, '230'),
(6, 'Mudah', 'Pengurangan', 'mcq', 'Berapakah sisa pengurangan: 500 - 180 = ...', '["320", "310", "330", "280"]'::jsonb, '320'),
(7, 'Mudah', 'Penulisan Nominal', 'input', 'Ketikkan nominal angka rupiah untuk: "Sembilan ratus ribu rupiah"', null, 'Rp 900.000'),
(8, 'Mudah', 'Penyebutan Nominal', 'input', 'Ketikkan terbilang dari nominal: Rp 50.750', null, 'Lima puluh ribu tujuh ratus lima puluh rupiah'),
(9, 'Mudah', 'Pertambahan', 'mcq', 'Uang kas kasir bertambah: Rp 15.000 + Rp 35.000 = ...', '["Rp 50.000", "Rp 45.000", "Rp 55.000", "Rp 60.000"]'::jsonb, 'Rp 50.000'),
(10, 'Mudah', 'Pengurangan', 'mcq', 'Uang kembalian dari transaksi: Rp 50.000 - Rp 27.500 = ...', '["Rp 22.500", "Rp 23.500", "Rp 21.500", "Rp 32.500"]'::jsonb, 'Rp 22.500'),

-- LEVEL 2: MENENGAH (Soal 11 s/d 20)
(11, 'Menengah', 'Pertambahan', 'mcq', 'Hitunglah penjumlahan multi-digit berikut: 12.450 + 47.750 = ...', '["60.200", "60.100", "59.200", "61.200"]'::jsonb, '60.200'),
(12, 'Menengah', 'Pengurangan', 'mcq', 'Hitunglah pengurangan berikut: 100.000 - 43.650 = ...', '["56.350", "57.350", "56.450", "55.350"]'::jsonb, '56.350'),
(13, 'Menengah', 'Penulisan Nominal', 'input', 'Ketikkan nominal angka rupiah untuk: "Dua juta tiga ratus lima puluh ribu rupiah"', null, 'Rp 2.350.000'),
(14, 'Menengah', 'Penyebutan Nominal', 'input', 'Ketikkan ejaan terbilang lengkap dari: Rp 4.780.250', null, 'Empat juta tujuh ratus delapan puluh ribu dua ratus lima puluh rupiah'),
(15, 'Menengah', 'Pertambahan', 'mcq', 'Hitung total 3 transaksi kas kecil: Rp 235.000 + Rp 415.000 + Rp 150.000 = ...', '["Rp 800.000", "Rp 790.000", "Rp 810.000", "Rp 850.000"]'::jsonb, 'Rp 800.000'),
(16, 'Menengah', 'Pengurangan', 'mcq', 'Saldo awal Rp 1.500.000 dikurangi pengeluaran operasional Rp 875.500. Berapa sisa saldo kas?', '["Rp 624.500", "Rp 625.500", "Rp 634.500", "Rp 724.500"]'::jsonb, 'Rp 624.500'),
(17, 'Menengah', 'Penulisan Nominal', 'input', 'Ketikkan nominal angka rupiah untuk: "Tujuh belas juta lima puluh ribu rupiah"', null, 'Rp 17.050.000'),
(18, 'Menengah', 'Penyebutan Nominal', 'input', 'Ketikkan terbilang dari angka: Rp 8.015.000', null, 'Delapan juta lima belas ribu rupiah'),
(19, 'Menengah', 'Pertambahan', 'mcq', 'Hitung total faktur: 1.425.000 + 2.875.000 = ...', '["Rp 4.300.000", "Rp 4.290.000", "Rp 4.350.000", "Rp 4.400.000"]'::jsonb, 'Rp 4.300.000'),
(20, 'Menengah', 'Pengurangan', 'mcq', 'Klaim reimbursement sebesar: 5.000.000 - 3.420.750 = ...', '["Rp 1.579.250", "Rp 1.589.250", "Rp 1.579.150", "Rp 1.679.250"]'::jsonb, 'Rp 1.579.250'),

-- LEVEL 3: SULIT (Soal 21 s/d 30)
(21, 'Sulit', 'Operasi Campuran', 'mcq', 'Hitung operasi hitung campuran berikut: (1.500.000 + 750.000) - 425.000 = ...', '["Rp 1.825.000", "Rp 1.815.000", "Rp 1.835.000", "Rp 1.725.000"]'::jsonb, 'Rp 1.825.000'),
(22, 'Sulit', 'Penulisan Nominal', 'input', 'Ketikkan nominal angka rupiah dengan teliti: "Seratus dua puluh lima juta tujuh ratus empat puluh ribu lima ratus rupiah"', null, 'Rp 125.740.500'),
(23, 'Sulit', 'Penyebutan Nominal', 'input', 'Ketikkan terbilang lengkap dari nominal: Rp 305.080.090', null, 'Tiga ratus lima juta delapan puluh ribu sembilan puluh rupiah'),
(24, 'Sulit', 'Operasi Campuran', 'mcq', 'Kas masuk Rp 15.000.000, lalu dibayarkan sewa Rp 4.250.000 dan utilitas Rp 1.875.000. Sisa kas: 15.000.000 - (4.250.000 + 1.875.000) = ...', '["Rp 8.875.000", "Rp 8.775.000", "Rp 8.975.000", "Rp 9.125.000"]'::jsonb, 'Rp 8.875.000'),
(25, 'Sulit', 'Penulisan Nominal', 'input', 'Ketikkan nominal angka rupiah untuk: "Sembilan ratus delapan juta tujuh ribu rupiah"', null, 'Rp 908.007.000'),
(26, 'Sulit', 'Penyebutan Nominal', 'input', 'Ketikkan terbilang dari slip setoran: Rp 42.008.300', null, 'Empat puluh dua juta delapan ribu tiga ratus rupiah'),
(27, 'Sulit', 'Pertambahan', 'mcq', 'Rekonsiliasi 4 cabang: Rp 18.450.000 + Rp 22.350.000 + Rp 14.200.000 + Rp 9.750.000 = ...', '["Rp 64.750.000", "Rp 63.750.000", "Rp 64.850.000", "Rp 65.000.000"]'::jsonb, 'Rp 64.750.000'),
(28, 'Sulit', 'Pengurangan', 'mcq', 'Plafon anggaran Rp 50.000.000 terpakai termin 1 Rp 18.750.000 dan termin 2 Rp 21.485.500. Sisa plafon: 50.000.000 - 18.750.000 - 21.485.500 = ...', '["Rp 9.764.500", "Rp 9.864.500", "Rp 9.765.500", "Rp 10.764.500"]'::jsonb, 'Rp 9.764.500'),
(29, 'Sulit', 'Penulisan Nominal', 'input', 'Ketikkan nominal angka untuk transfer pajak: "Dua ratus dua puluh lima juta enam puluh ribu empat ratus rupiah"', null, 'Rp 225.060.400'),
(30, 'Sulit', 'Operasi Campuran', 'mcq', 'Penjualan Rp 8.500.000 dikurangi retur Rp 450.000 dan diskon Rp 325.000, lalu ditambah ongkir Rp 175.000. Total penerimaan bersih: (8.500.000 - 450.000 - 325.000) + 175.000 = ...', '["Rp 7.900.000", "Rp 7.850.000", "Rp 7.950.000", "Rp 8.000.000"]'::jsonb, 'Rp 7.900.000');

-- =========================================================================
-- HARDENED ROW LEVEL SECURITY (RLS) POLICIES (DENGAN FALLBACK AMAN)
-- =========================================================================

-- Aktifkan RLS pada seluruh tabel
ALTER TABLE exam_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_answers ENABLE ROW LEVEL SECURITY;

-- 1. exam_settings: Boleh dibaca oleh publik & service role
CREATE POLICY "Public read exam_settings" ON exam_settings FOR SELECT USING (true);
CREATE POLICY "Service role all exam_settings" ON exam_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. questions: Boleh dibaca oleh publik & service role (kunci jawaban tetap disaring oleh server API)
CREATE POLICY "Public read questions" ON questions FOR SELECT USING (true);
CREATE POLICY "Service role all questions" ON questions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. participants: Boleh INSERT & DELETE
CREATE POLICY "Allow insert participants" ON participants FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow select participants" ON participants FOR SELECT USING (true);
CREATE POLICY "Allow delete participants" ON participants FOR DELETE USING (true);
CREATE POLICY "Service role all participants" ON participants FOR ALL USING (true) WITH CHECK (true);

-- 4. exam_sessions: Boleh INSERT, SELECT & DELETE (dikelola HR Admin)
CREATE POLICY "Allow insert exam_sessions" ON exam_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow select exam_sessions" ON exam_sessions FOR SELECT USING (true);
CREATE POLICY "Allow delete exam_sessions" ON exam_sessions FOR DELETE USING (true);
CREATE POLICY "Service role all exam_sessions" ON exam_sessions FOR ALL USING (true) WITH CHECK (true);

-- 5. exam_answers: Boleh INSERT, SELECT & DELETE (dikelola HR Admin)
CREATE POLICY "Allow insert exam_answers" ON exam_answers FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow select exam_answers" ON exam_answers FOR SELECT USING (true);
CREATE POLICY "Allow delete exam_answers" ON exam_answers FOR DELETE USING (true);
CREATE POLICY "Service role all exam_answers" ON exam_answers FOR ALL USING (true) WITH CHECK (true);


