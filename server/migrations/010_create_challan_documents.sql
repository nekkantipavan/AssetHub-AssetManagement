-- Migration 010: Create challan_documents table for month-based archiving
CREATE TABLE IF NOT EXISTS challan_documents (
  id             SERIAL PRIMARY KEY,
  transfer_id    INTEGER REFERENCES transfers(id) ON DELETE SET NULL,
  challan_no     VARCHAR(100) NOT NULL,
  challan_type   VARCHAR(50) NOT NULL, -- 'Delivery', 'Return', 'Legacy'
  challan_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  month_folder   VARCHAR(7) NOT NULL,  -- 'YYYY-MM'
  file_path      TEXT NOT NULL,        -- 'uploads/challans/2026-08/filename.pdf'
  original_name  VARCHAR(255) NOT NULL,
  file_size      BIGINT NOT NULL,
  mime_type      VARCHAR(100) DEFAULT 'application/pdf',
  uploaded_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes          TEXT,
  created_at     TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_challan_docs_month ON challan_documents(month_folder);
CREATE INDEX IF NOT EXISTS idx_challan_docs_no ON challan_documents(challan_no);
