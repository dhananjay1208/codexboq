CREATE TABLE IF NOT EXISTS packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS boq_headlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID REFERENCES packages(id) ON DELETE CASCADE,
  sl_no TEXT,
  title TEXT,
  sort_order INT
);

CREATE TABLE IF NOT EXISTS boq_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  headline_id UUID REFERENCES boq_headlines(id) ON DELETE CASCADE,
  sl_no TEXT,
  description TEXT,
  unit TEXT,
  quantity NUMERIC,
  rate NUMERIC,
  amount NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE boq_headlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE boq_line_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'packages' AND policyname = 'demo_all'
  ) THEN
    CREATE POLICY "demo_all" ON packages FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'boq_headlines' AND policyname = 'demo_all'
  ) THEN
    CREATE POLICY "demo_all" ON boq_headlines FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'boq_line_items' AND policyname = 'demo_all'
  ) THEN
    CREATE POLICY "demo_all" ON boq_line_items FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
