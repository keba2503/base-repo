CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"actor_kind" text NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL
);

CREATE INDEX "audit_log_tenant_occurred_idx" ON "audit_log" USING btree ("tenant_id","occurred_at");
CREATE INDEX "audit_log_tenant_resource_idx" ON "audit_log" USING btree ("tenant_id","resource_type","resource_id");

GRANT SELECT, INSERT ON TABLE audit_log TO app_user;
GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO app_user;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE audit_log FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE audit_log FROM authenticated;
  END IF;
END
$$;

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_log_platform_all ON audit_log
  FOR ALL USING (current_tenant_id() IS NULL) WITH CHECK (current_tenant_id() IS NULL);
CREATE POLICY audit_log_own_select ON audit_log
  FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY audit_log_own_insert ON audit_log
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE FUNCTION audit_log_immutable() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log rows are append only: % is not allowed', TG_OP;
END
$$;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();