# Panduan Prompt AI untuk Pembuatan & Pembaruan Soal Otomatis
## MathSimple Employee Assessment

Dokumen ini berisi kumpulan **Prompt Template** yang siap disalin (*copy-paste*) ke AI (ChatGPT, Claude, atau Gemini) untuk menghasilkan paket 30 soal baru atau memperbarui soal yang sudah ada, dengan format yang langsung kompatibel dengan database Supabase dan aplikasi MathSimple.

---

## 📋 Prompt Template 1: Generate Paket Lengkap 30 Soal Baru (Format JSON)

> **Cara Penggunaan:** Salin seluruh teks di bawah ini ke ChatGPT / Gemini / Claude, lalu salin output JSON-nya langsung ke menu input massal / Supabase.

```text
Bertindaklah sebagai Senior HR Assessor & Pembuat Soal Tes Matematika Bisnis. 
Saya membutuhkan paket 30 soal tes matematika dan ketelitian nominal karyawan untuk aplikasi asesmen perusahaan dengan spesifikasi ketat sebagai berikut:

KOMPOSISI SOAL (Total 30 Soal):
1. Level 1 - MUDAH (Soal 1 s/d 10):
   - Soal 1, 5, 9: Penjumlahan dasar (puluhan & ratusan). Format: MCQ (Pilihan Ganda A, B, C, D).
   - Soal 2, 6, 10: Pengurangan dasar (ratusan & ribuan). Format: MCQ (Pilihan Ganda A, B, C, D).
   - Soal 3, 7: Penulisan nominal angka dari teks terbilang (puluhan/ratusan ribu rupiah). Format: INPUT (Isian Singkat, misal: "Rp 75.000").
   - Soal 4, 8: Penyebutan terbilang dari nominal angka. Format: INPUT (Isian Singkat).

2. Level 2 - MENENGAH (Soal 11 s/d 20):
   - Soal 11, 15, 19: Penjumlahan angka ribuan/puluhan ribu dengan angka tidak bulat. Format: MCQ.
   - Soal 12, 16, 20: Pengurangan kas/kembalian belanja multi-digit. Format: MCQ.
   - Soal 13, 17: Penulisan nominal angka jutaan rupiah dengan tanda titik yang tepat. Format: INPUT.
   - Soal 14, 18: Penyebutan terbilang jutaan rupiah secara teliti. Format: INPUT.

3. Level 3 - SULIT (Soal 21 s/d 30):
   - Soal 21, 24, 27: Operasi campuran beruntun bertingkat (+) dan (-) dalam konteks kas operasional / nota belanja. Format: MCQ.
   - Soal 28, 30: Studi kasus arus kas masuk, retur, potongan diskon, atau sisa anggaran. Format: MCQ.
   - Soal 22, 25, 29: Penulisan nominal puluhan/ratusan juta rupiah (ketelitian posisi nol dan tanda titik). Format: INPUT.
   - Soal 23, 26: Penyebutan terbilang nominal puluhan/ratusan juta rupiah. Format: INPUT.

ATURAN FORMATTING & VALIDASI:
- Untuk soal tipe "mcq", sediakan array 4 opsi pilihan `options: ["A", "B", "C", "D"]` dan tentukan `correct_answer` (indeks 0, 1, 2, atau 3). Pastikan angka pengecoh (distractor) realistis berdasarkan kesalahan hitung yang umum.
- Untuk soal tipe "input", sediakan `correct_answer` (format baku seperti "Rp 125.750.000" atau kalimat terbilang bahasa Indonesia yang baku menurut PUEBI).
- Berikan output HANYA dalam format JSON valid tanpa teks pembuka/penutup agar bisa langsung diparse.

FORMAT JSON OUTPUT YANG WAJIB DIIKUTI:
[
  {
    "question_order": 1,
    "difficulty": "Mudah",
    "category": "Pertambahan",
    "question_type": "mcq",
    "question_text": "Berapakah hasil dari 450 + 725?",
    "options": ["1.175", "1.165", "1.185", "1.155"],
    "correct_answer": "1.175",
    "explanation": "450 + 725 = 1.175"
  },
  {
    "question_order": 3,
    "difficulty": "Mudah",
    "category": "Penulisan Nominal",
    "question_type": "input",
    "question_text": "Tuliskan nominal angka rupiah dari: 'Tujuh puluh lima ribu rupiah'",
    "options": null,
    "correct_answer": "Rp 75.000",
    "explanation": "Penulisan baku menggunakan Rp diikuti spasi dan tanda titik pemisah ribuan."
  }
]
```

---

## 🔄 Prompt Template 2: Ganti / Update 1 Butir Soal Tertentu

> **Gunakan prompt ini jika ingin mengganti soal spesifik (misalnya nomor 14 terlalu mudah atau ada kesalahan).**

```text
Tolong buatkan 1 butir soal pengganti untuk nomor [MASUKKAN NOMOR SOAL, contoh: No 14] aplikasi MathSimple dengan kriteria:
- Kategori: [PILIH: Pertambahan / Pengurangan / Penulisan Nominal / Penyebutan Nominal / Operasi Campuran]
- Tingkat Kesulitan: [PILIH: Mudah / Menengah / Sulit]
- Tipe Jawaban: [PILIH: mcq (Pilihan Ganda) / input (Isian Singkat)]
- Topik / Studi Kasus: [Contoh: Transaksi kasir kembalian belanja 500 ribu dengan pecahan receh]

Format output JSON tunggal:
{
  "question_order": 14,
  "difficulty": "...",
  "category": "...",
  "question_type": "...",
  "question_text": "...",
  "options": ["Opsi A", "Opsi B", "Opsi C", "Opsi D"], // Atau null jika isian singkat
  "correct_answer": "...",
  "explanation": "..."
}
```

---

## 🗄️ Prompt Template 3: Generate SQL Insert Langsung ke Supabase

> **Gunakan prompt ini jika ingin langsung mengeksekusi script SQL ke SQL Editor Supabase.**

```text
Buatkan skrip SQL INSERT untuk tabel 'questions' di database Supabase untuk 30 soal tes matematika karyawan.
Skema tabel:
INSERT INTO questions (question_order, category, difficulty, question_type, question_text, options, correct_answer) VALUES
(1, 'Pertambahan', 'easy', 'mcq', '450 + 725 = ...', '["1.175", "1.165", "1.185", "1.155"]'::jsonb, '1.175'),
... hingga nomor 30.

Sertakan 10 soal level easy, 10 medium, 10 hard dengan komposisi hitungan (mcq) dan nominal rupiah (input).
```
