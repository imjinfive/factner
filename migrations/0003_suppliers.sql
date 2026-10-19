CREATE TABLE suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  categories TEXT NOT NULL DEFAULT '[]',
  area TEXT NOT NULL DEFAULT '',
  moq INTEGER NOT NULL DEFAULT 1,
  days INTEGER NOT NULL DEFAULT 1,
  description TEXT NOT NULL DEFAULT '',
  material TEXT NOT NULL DEFAULT '',
  finish TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','archived')),
  actual_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (actual_confirmed IN (0,1)),
  visited INTEGER NOT NULL DEFAULT 0 CHECK (visited IN (0,1)),
  visited_at TEXT NOT NULL DEFAULT '',
  verified_by TEXT NOT NULL DEFAULT '',
  internal_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX suppliers_state ON suppliers(state,created_at);
CREATE TABLE supplier_images (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  mime TEXT NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp')),
  data BLOB NOT NULL,
  caption TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('workshop','sample','delivery','case')),
  created_at TEXT NOT NULL
);
CREATE INDEX supplier_images_supplier ON supplier_images(supplier_id,created_at);
CREATE TABLE supplier_events (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX supplier_events_supplier ON supplier_events(supplier_id,created_at);
