# Kebijakan & Arsitektur Keamanan (Security Guidelines)
## MathSimple Employee Assessment

Dokumen ini memetakan standar keamanan untuk menjamin integritas data ujian, kerahasiaan kunci jawaban, dan pencegahan kecurangan pada arsitektur GitHub Publik, Vercel, dan Supabase.

---

## 🛡️ 1. Pemisahan Hak Akses & API Keys

| Komponen | Tingkat Kerahasiaan | Lokasi Penyimpanan | Catatan Keamanan |
| :--- | :--- | :--- | :--- |
| **`NEXT_PUBLIC_SUPABASE_URL`** | Publik | Vercel Env / `.env.local` | Boleh terlihat di browser; hanya alamat endpoint Supabase. |
| **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** | Publik (Terbatas RLS) | Vercel Env / `.env.local` | Dibatasi secara ketat oleh Row Level Security (RLS) PostgreSQL. |
| **`SUPABASE_SERVICE_ROLE_KEY`** | **Sangat Rahasia** | Vercel Server Env Only | **Dilarang keras** ditaruh di Git atau frontend; bypass semua RLS. |
| **`ADMIN_PIN` / Password HR** | **Sangat Rahasia** | Vercel Server Env Only | Digunakan untuk otorisasi akses ke Dashboard HR. |

---

## 🔒 2. Tiga Celah Utama & Solusi Proteksinya

### A. Pencegahan Kebocoran Kunci Jawaban (Anti-Curang F12)
- **Celah:** Jika browser peserta mengunduh data yang memiliki kolom `correct_answer`, peserta dapat membuka tab Network/Console di browser dan melihat semua kunci jawaban.
- **Proteksi:**
  - Data yang dikirim ke browser peserta **hanya teks pertanyaan dan pilihan A, B, C, D** (tanpa kunci jawaban).
  - Penilaian jawaban dilakukan di sisi server (*Server-Side Route / Action*), membandingkan jawaban peserta dengan kunci di database Supabase tanpa pernah mengekspos kunci ke browser.

### B. Proteksi Halaman Admin & Bank Soal
- **Celah:** Peserta dapat menekan tombol menu Admin dan melihat hasil tes peserta lain atau mengganti butir soal.
- **Proteksi:**
  - Pintu gerbang login / PIN Admin di sisi server.
  - Sesi login admin diverifikasi sebelum dashboard dapat menampilkan data leaderboard atau bank soal.

### C. Row Level Security (RLS) di Supabase
- **Celah:** Pihak luar mengeksekusi request HTTP ke API Supabase untuk menghapus tabel `exam_sessions`.
- **Proteksi:**
  - Mengaktifkan aturan RLS: Publik hanya diizinkan melakukan `INSERT` lembar jawaban baru, **dilarang keras melakukan `UPDATE` atau `DELETE`**.
  - Hanya role Admin yang memiliki wewenang mengelola bank soal.

---

## 💡 3. Rekomendasi Repositori GitHub

Meskipun sistem telah diamankan dengan prinsip di atas, sangat direkomendasikan untuk mengubah visibilitas repositori menjadi **Private**:
- Akun Vercel gratis tetap dapat melakukan deploy otomatis dari repositori GitHub Private.
- Tidak ada pihak luar yang dapat mempelajari struktur internal kode atau bank soal bawaan.
