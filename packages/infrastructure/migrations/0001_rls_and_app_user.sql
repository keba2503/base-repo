CREATE FUNCTION current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE ON TABLE tenants TO app_user;
GRANT SELECT, INSERT, UPDATE ON TABLE outbox TO app_user;
GRANT USAGE, SELECT ON SEQUENCE outbox_id_seq TO app_user;
GRANT EXECUTE ON FUNCTION current_tenant_id() TO app_user;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE tenants, outbox FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE tenants, outbox FROM authenticated;
  END IF;
END
$$;

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox FORCE ROW LEVEL SECURITY;

CREATE POLICY tenants_registry_select ON tenants
  FOR SELECT USING (current_tenant_id() IS NULL);
CREATE POLICY tenants_registry_insert ON tenants
  FOR INSERT WITH CHECK (current_tenant_id() IS NULL);
CREATE POLICY tenants_registry_update ON tenants
  FOR UPDATE USING (current_tenant_id() IS NULL) WITH CHECK (current_tenant_id() IS NULL);

CREATE POLICY tenants_own_select ON tenants
  FOR SELECT USING (id = current_tenant_id());
CREATE POLICY tenants_own_insert ON tenants
  FOR INSERT WITH CHECK (id = current_tenant_id());
CREATE POLICY tenants_own_update ON tenants
  FOR UPDATE USING (id = current_tenant_id()) WITH CHECK (id = current_tenant_id());

CREATE POLICY outbox_platform_all ON outbox
  FOR ALL USING (current_tenant_id() IS NULL) WITH CHECK (current_tenant_id() IS NULL);
CREATE POLICY outbox_own_all ON outbox
  FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
