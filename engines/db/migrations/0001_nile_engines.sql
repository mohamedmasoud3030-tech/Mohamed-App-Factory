-- Nile engines — initial schema (mirrors the Drizzle schemas under engines/*/src/db)
-- Tenancy: ADR-0002 (shared DB, explicit tenant scope) + ADR-0005 (fail-closed RLS).
-- Every tenant-owned table: tenant_id + RLS + FORCE RLS. Unset tenant context
-- => current_setting returns '' => NULLIF => NULL => zero rows (deny by default).
-- Runtime application role must NOT be superuser / owner / BYPASSRLS (ADR-0005 §7).

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  is_demo text NOT NULL DEFAULT 'false',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id),
  user_id text NOT NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  payload text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- transactions -------------------------------------------------------------
CREATE TABLE sales_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id),
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'posted',
  total_minor integer NOT NULL,
  currency text NOT NULL DEFAULT 'EGP',
  idempotency_key text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE transaction_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id),
  transaction_id uuid NOT NULL REFERENCES sales_transactions(id),
  item_id uuid NOT NULL,
  quantity numeric(18,3) NOT NULL,
  unit_price_minor integer NOT NULL,
  line_total_minor integer NOT NULL
);

CREATE TABLE stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id),
  item_id uuid NOT NULL,
  warehouse text NOT NULL DEFAULT 'main',
  direction text NOT NULL,
  quantity numeric(18,3) NOT NULL,
  cost_per_unit_minor integer,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id),
  shift_id uuid NOT NULL,
  direction text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  amount_minor integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- booking ------------------------------------------------------------------
CREATE TABLE bookable_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id),
  kind text NOT NULL,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  is_active text NOT NULL DEFAULT 'true'
);

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id),
  resource_id uuid NOT NULL REFERENCES bookable_resources(id),
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  deposit_minor integer NOT NULL DEFAULT 0,
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

-- catalog ------------------------------------------------------------------
CREATE TABLE catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id),
  name_ar text NOT NULL,
  name_en text NOT NULL,
  category text NOT NULL,
  price_minor integer NOT NULL,
  compare_at_minor integer,
  is_active text NOT NULL DEFAULT 'true'
);

CREATE TABLE catalog_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id),
  item_id uuid NOT NULL REFERENCES catalog_items(id),
  sku text NOT NULL,
  label_ar text NOT NULL,
  label_en text NOT NULL,
  stock integer NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, sku)
);

CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id),
  source text NOT NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  message text,
  stage text NOT NULL DEFAULT 'NEW',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- people -------------------------------------------------------------------
CREATE TABLE employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  role text NOT NULL,
  phone text,
  base_salary_minor integer NOT NULL,
  is_active text NOT NULL DEFAULT 'true'
);

CREATE TABLE attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id),
  employee_id uuid NOT NULL REFERENCES employees(id),
  day text NOT NULL,
  check_in text,
  check_out text,
  status text NOT NULL DEFAULT 'PRESENT',
  UNIQUE (tenant_id, employee_id, day)
);

CREATE TABLE leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id),
  employee_id uuid NOT NULL REFERENCES employees(id),
  days integer NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id),
  employee_id uuid NOT NULL REFERENCES employees(id),
  total_minor integer NOT NULL,
  months integer NOT NULL,
  remaining_minor integer NOT NULL
);

-- Helpful tenant-first indexes --------------------------------------------
CREATE INDEX idx_bookings_resource_time ON bookings (tenant_id, resource_id, starts_at);
CREATE INDEX idx_stock_item ON stock_movements (tenant_id, item_id, created_at);
CREATE INDEX idx_leads_stage ON leads (tenant_id, stage, created_at);
CREATE INDEX idx_audit_tenant ON audit_log (tenant_id, created_at);

-- RLS: fail-closed tenant isolation (ADR-0005 §6) ---------------------------
-- organizations is special: a tenant sees only its own row.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON organizations
  USING (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'audit_log','sales_transactions','transaction_lines','stock_movements',
    'cash_movements','bookable_resources','bookings','catalog_items',
    'catalog_variants','leads','employees','attendance_records',
    'leave_requests','loans'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      'USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) '
      'WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
  END LOOP;
END $$;
