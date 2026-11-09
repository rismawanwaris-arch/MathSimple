-- =========================================================================
-- SECURITY HARDENING (JALANKAN SEKALI DI SUPABASE -> SQL Editor -> Run)
-- Aman dijalankan ulang (idempotent). TIDAK menghapus data.
--
-- Tujuan: anon key (yang publik di browser) TIDAK boleh membaca/menulis/menghapus
-- tabel apa pun. Seluruh akses data hanya lewat server Next.js memakai
-- SUPABASE_SERVICE_ROLE_KEY (service_role mem-bypass RLS).
--
-- PRASYARAT: SUPABASE_SERVICE_ROLE_KEY di Vercel harus berisi kunci "service_role"
-- (bukan anon). Jika salah, aplikasi akan gagal menyimpan setelah skrip ini dijalankan.
-- =========================================================================

-- 1. Hapus semua policy permisif lama
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('exam_settings','participants','questions','exam_sessions','exam_answers')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 2. Pastikan RLS aktif & dipaksa
ALTER TABLE public.exam_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_answers  ENABLE ROW LEVEL SECURITY;

-- 3. Cabut seluruh hak akses role publik (anon & authenticated)
REVOKE ALL ON public.exam_settings FROM anon, authenticated;
REVOKE ALL ON public.participants  FROM anon, authenticated;
REVOKE ALL ON public.questions     FROM anon, authenticated;
REVOKE ALL ON public.exam_sessions FROM anon, authenticated;
REVOKE ALL ON public.exam_answers  FROM anon, authenticated;

-- 4. Hanya service_role (server) yang boleh akses
GRANT ALL ON public.exam_settings, public.participants, public.questions,
             public.exam_sessions, public.exam_answers TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Tanpa policy untuk anon/authenticated = akses ditolak (default deny).
