# MathSimple - Aplikasi Ujian Matematika Sederhana & Nominal Karyawan

Aplikasi berbasis web untuk asesmen ketelitian berhitung dan pemahaman nominal uang bagi karyawan/kandidat. Dibangun menggunakan arsitektur modern **Next.js**, backend database **Supabase**, dan dideploy di platform **Vercel**.

---

## 🎯 Fitur Utama

1. **30 Butir Soal Bergradasi (Tingkat Kesulitan)**
   - **Level 1 (Mudah - 10 Soal):** Penjumlahan & pengurangan ratusan/ribuan, penulisan nominal dasar.
   - **Level 2 (Menengah - 10 Soal):** Hitungan multi-digit, kembalian belanja, nominal jutaan rupiah.
   - **Level 3 (Sulit - 10 Soal):** Operasi hitung campuran (+ dan - beruntun), rekonsiliasi kas, nominal ratusan juta rupiah.

2. **Format Jawaban Campuran (Hybrid Input)**
   - **Pilihan Ganda (A, B, C, D):** Untuk kategori hitungan pertambahan & pengurangan (menghindari typo kalkulasi).
   - **Isian Singkat (Text Input):** Untuk penulisan nominal rupiah (contoh: `Rp 75.000`) dan kalimat terbilang guna menguji ketelitian ejaan & format angka.

3. **Integritas Waktu (15 Menit Timer)**
   - Hitung mundur *real-time* 15 menit (rata-rata 30 detik/soal).
   - *Auto-submit* otomatis saat waktu habis tanpa ada jawaban yang hilang.

4. **Kerahasiaan Nilai & Dashboard HR**
   - Karyawan hanya menerima konfirmasi tanda terima bahwa ujian telah selesai diserahkan.
   - Tim HR/Pengawas memiliki dashboard khusus untuk melihat rekapitulasi nilai, detail jawaban benar/salah, waktu pengerjaan, dan ekspor ke CSV.

---

## 🏗️ Tech Stack

- **Framework:** [Next.js](https://nextjs.org/) (App Router, React Server Components)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Database & Backend:** [Supabase](https://supabase.com/) (PostgreSQL & Row Level Security)
- **Deployment:** [Vercel](https://vercel.com/)
- **Icons:** Lucide React

---

## 📂 Struktur Database Supabase

- `employees`: Data identitas karyawan (NIK, Nama, Departemen).
- `questions`: Bank 30 soal (kategori, level kesulitan, tipe soal, kunci jawaban).
- `exam_sessions`: Sesi ujian per karyawan (waktu mulai, selesai, skor total, status).
- `exam_answers`: Rincian jawaban setiap butir soal per sesi ujian.

---

Dokumen lengkap spesifikasi produk dapat dilihat pada [PRD.md](./PRD.md).
