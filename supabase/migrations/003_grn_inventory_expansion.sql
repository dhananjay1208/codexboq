-- Expansion 1: GRN + Inventory production parity schema

-- Alter existing
ALTER TABLE grn_invoices ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE grn_line_items
  ADD COLUMN IF NOT EXISTS amount_without_gst NUMERIC,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- DC at invoice level
CREATE TABLE IF NOT EXISTS grn_invoice_dc (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_invoice_id UUID NOT NULL REFERENCES grn_invoices(id) ON DELETE CASCADE,
  is_applicable BOOLEAN NOT NULL DEFAULT true,
  is_uploaded BOOLEAN NOT NULL DEFAULT false,
  file_path TEXT,
  file_name TEXT,
  document_date DATE,
  uploaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (grn_invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_grn_invoice_dc_invoice
  ON grn_invoice_dc(grn_invoice_id);

-- Per-line-item docs (mir, test_certificate, tds)
CREATE TABLE IF NOT EXISTS grn_line_item_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_line_item_id UUID NOT NULL REFERENCES grn_line_items(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('mir', 'test_certificate', 'tds')),
  is_applicable BOOLEAN NOT NULL DEFAULT true,
  is_uploaded BOOLEAN NOT NULL DEFAULT false,
  file_path TEXT,
  file_name TEXT,
  document_date DATE,
  uploaded_at TIMESTAMPTZ,
  ai_audit JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (grn_line_item_id, document_type)
);

CREATE INDEX IF NOT EXISTS idx_grn_line_item_docs_line
  ON grn_line_item_documents(grn_line_item_id);

-- Material consumption (Material Issue agent target)
CREATE TABLE IF NOT EXISTS material_consumption (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  material_id UUID REFERENCES master_materials(id),
  material_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  consumption_date DATE NOT NULL,
  issued_to TEXT,
  notes TEXT,
  source_file_path TEXT,
  ai_extracted_raw JSONB,
  ai_match_confidence NUMERIC,
  status TEXT NOT NULL CHECK (status IN ('draft', 'extracted', 'reviewed', 'committed')) DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consumption_site_material
  ON material_consumption(site_id, material_id);

-- Permissive RLS
ALTER TABLE grn_invoice_dc ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_line_item_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_consumption ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'grn_invoice_dc'
      AND policyname = 'demo_all'
  ) THEN
    CREATE POLICY "demo_all" ON grn_invoice_dc
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'grn_line_item_documents'
      AND policyname = 'demo_all'
  ) THEN
    CREATE POLICY "demo_all" ON grn_line_item_documents
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'material_consumption'
      AND policyname = 'demo_all'
  ) THEN
    CREATE POLICY "demo_all" ON material_consumption
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Triggers: auto-create child placeholder rows
CREATE OR REPLACE FUNCTION create_dc_slot_for_invoice() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO grn_invoice_dc (grn_invoice_id, is_applicable)
  VALUES (NEW.id, true)
  ON CONFLICT (grn_invoice_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_dc_slot ON grn_invoices;

CREATE TRIGGER trg_create_dc_slot
AFTER INSERT ON grn_invoices
FOR EACH ROW EXECUTE FUNCTION create_dc_slot_for_invoice();

CREATE OR REPLACE FUNCTION create_doc_slots_for_line_item() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO grn_line_item_documents (grn_line_item_id, document_type, is_applicable)
  VALUES
    (NEW.id, 'mir', true),
    (NEW.id, 'test_certificate', true),
    (NEW.id, 'tds', true)
  ON CONFLICT (grn_line_item_id, document_type) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_doc_slots ON grn_line_items;

CREATE TRIGGER trg_create_doc_slots
AFTER INSERT ON grn_line_items
FOR EACH ROW EXECUTE FUNCTION create_doc_slots_for_line_item();

-- Backfill: create slots for any existing invoices / line items
INSERT INTO grn_invoice_dc (grn_invoice_id, is_applicable)
SELECT id, true
FROM grn_invoices
WHERE id NOT IN (SELECT grn_invoice_id FROM grn_invoice_dc)
ON CONFLICT (grn_invoice_id) DO NOTHING;

INSERT INTO grn_line_item_documents (grn_line_item_id, document_type, is_applicable)
SELECT li.id, t.dt, true
FROM grn_line_items li
CROSS JOIN (VALUES ('mir'), ('test_certificate'), ('tds')) AS t(dt)
WHERE NOT EXISTS (
  SELECT 1
  FROM grn_line_item_documents d
  WHERE d.grn_line_item_id = li.id
    AND d.document_type = t.dt
)
ON CONFLICT (grn_line_item_id, document_type) DO NOTHING;
