CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT,
  client_name TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_name TEXT NOT NULL,
  gstin TEXT,
  address TEXT,
  contact TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS master_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  embedding vector(1536),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS grn_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id),
  supplier_id UUID REFERENCES suppliers(id),
  invoice_number TEXT,
  invoice_date DATE,
  grn_date DATE,
  total_amount NUMERIC,
  source_file_path TEXT,
  ai_extracted_raw JSONB,
  status TEXT CHECK (status IN ('draft', 'extracted', 'reviewed', 'committed')) DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS grn_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_invoice_id UUID REFERENCES grn_invoices(id) ON DELETE CASCADE,
  material_id UUID REFERENCES master_materials(id),
  material_name TEXT,
  quantity NUMERIC,
  unit TEXT,
  rate NUMERIC,
  gst_rate NUMERIC,
  amount_with_gst NUMERIC,
  ai_match_confidence NUMERIC
);

CREATE TABLE IF NOT EXISTS material_compliance_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID REFERENCES master_materials(id),
  doc_type TEXT CHECK (doc_type IN ('test_certificate', 'tds')),
  status TEXT CHECK (status IN ('pending', 'uploaded', 'not_applicable', 'flagged')) DEFAULT 'pending',
  file_path TEXT,
  file_name TEXT,
  ai_audit JSONB,
  validity_date DATE,
  uploaded_at TIMESTAMPTZ,
  UNIQUE(material_id, doc_type)
);

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_compliance_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sites' AND policyname = 'demo_all'
  ) THEN
    CREATE POLICY "demo_all" ON sites FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'suppliers' AND policyname = 'demo_all'
  ) THEN
    CREATE POLICY "demo_all" ON suppliers FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'master_materials' AND policyname = 'demo_all'
  ) THEN
    CREATE POLICY "demo_all" ON master_materials FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'grn_invoices' AND policyname = 'demo_all'
  ) THEN
    CREATE POLICY "demo_all" ON grn_invoices FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'grn_line_items' AND policyname = 'demo_all'
  ) THEN
    CREATE POLICY "demo_all" ON grn_line_items FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'material_compliance_documents' AND policyname = 'demo_all'
  ) THEN
    CREATE POLICY "demo_all" ON material_compliance_documents FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO sites (id, name, location, client_name, status)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'Hackathon Demo Tower', 'Bengaluru, Karnataka', 'Outskill Realty', 'active'),
  ('22222222-2222-4222-8222-222222222222', 'Metro Station Phase II', 'Mumbai, Maharashtra', 'Metro Infra JV', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO suppliers (id, supplier_name, gstin, address, contact)
VALUES
  ('33333333-3333-4333-8333-333333333331', 'Shree Cement Distributors Pvt Ltd', '29AAECS1234F1Z5', 'Peenya Industrial Area, Bengaluru, Karnataka', '+91 98765 11001'),
  ('33333333-3333-4333-8333-333333333332', 'Tata Tiscon Steel Traders', '27AAACT2727Q1ZW', 'Kalamboli Steel Market, Navi Mumbai, Maharashtra', '+91 98765 11002'),
  ('33333333-3333-4333-8333-333333333333', 'BlueMetal Aggregates Co', '33AABCB5678M1Z2', 'Oragadam Quarry Road, Chennai, Tamil Nadu', '+91 98765 11003'),
  ('33333333-3333-4333-8333-333333333334', 'ElectraBuild Solutions LLP', '07AAEFE4321L1Z8', 'Okhla Industrial Estate, New Delhi', '+91 98765 11004'),
  ('33333333-3333-4333-8333-333333333335', 'Jain Plumbing & Sanitary Mart', '24AAAFJ9012K1Z6', 'GIDC Vatva, Ahmedabad, Gujarat', '+91 98765 11005')
ON CONFLICT (id) DO NOTHING;

INSERT INTO master_materials (id, category, name, unit)
VALUES
  ('44444444-4444-4444-8444-444444444401', 'Cement', 'OPC 53 Grade Cement', 'bag'),
  ('44444444-4444-4444-8444-444444444402', 'Cement', 'PPC Cement', 'bag'),
  ('44444444-4444-4444-8444-444444444403', 'Cement', 'Ready Mix Concrete M25', 'cum'),
  ('44444444-4444-4444-8444-444444444404', 'Cement', 'Ready Mix Concrete M30', 'cum'),
  ('44444444-4444-4444-8444-444444444405', 'Steel', 'TMT Bar Fe500D 8 mm', 'kg'),
  ('44444444-4444-4444-8444-444444444406', 'Steel', 'TMT Bar Fe500D 12 mm', 'kg'),
  ('44444444-4444-4444-8444-444444444407', 'Steel', 'TMT Bar Fe500D 16 mm', 'kg'),
  ('44444444-4444-4444-8444-444444444408', 'Steel', 'Binding Wire 18 Gauge', 'kg'),
  ('44444444-4444-4444-8444-444444444409', 'Aggregates', 'Crushed Stone Aggregate 20 mm', 'cum'),
  ('44444444-4444-4444-8444-444444444410', 'Aggregates', 'Crushed Stone Aggregate 10 mm', 'cum'),
  ('44444444-4444-4444-8444-444444444411', 'Aggregates', 'River Sand', 'cum'),
  ('44444444-4444-4444-8444-444444444412', 'Aggregates', 'Manufactured Sand', 'cum'),
  ('44444444-4444-4444-8444-444444444413', 'Electrical', 'FRLS Copper Wire 1.5 sqmm', 'm'),
  ('44444444-4444-4444-8444-444444444414', 'Electrical', 'FRLS Copper Wire 2.5 sqmm', 'm'),
  ('44444444-4444-4444-8444-444444444415', 'Electrical', 'PVC Conduit 25 mm', 'm'),
  ('44444444-4444-4444-8444-444444444416', 'Electrical', 'MCB Distribution Board 12 Way', 'nos'),
  ('44444444-4444-4444-8444-444444444417', 'Electrical', 'LED Panel Light 36W', 'nos'),
  ('44444444-4444-4444-8444-444444444418', 'Plumbing', 'CPVC Pipe 25 mm', 'm'),
  ('44444444-4444-4444-8444-444444444419', 'Plumbing', 'UPVC Soil Pipe 110 mm', 'm'),
  ('44444444-4444-4444-8444-444444444420', 'Plumbing', 'GI Pipe 40 mm Medium Class', 'm'),
  ('44444444-4444-4444-8444-444444444421', 'Plumbing', 'Ball Valve 25 mm Brass', 'nos'),
  ('44444444-4444-4444-8444-444444444422', 'Bricks', 'Red Clay Brick Class 10', 'nos'),
  ('44444444-4444-4444-8444-444444444423', 'Bricks', 'AAC Block 600x200x100 mm', 'nos'),
  ('44444444-4444-4444-8444-444444444424', 'Bricks', 'Fly Ash Brick', 'nos'),
  ('44444444-4444-4444-8444-444444444425', 'Bricks', 'Concrete Solid Block 200 mm', 'nos')
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('boqai-docs', 'boqai-docs', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'demo_all'
  ) THEN
    CREATE POLICY "demo_all" ON storage.objects
      FOR ALL
      USING (bucket_id = 'boqai-docs')
      WITH CHECK (bucket_id = 'boqai-docs');
  END IF;
END $$;
