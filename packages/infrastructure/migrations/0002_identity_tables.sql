CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"revoked_at" timestamp with time zone
);

CREATE TABLE "memberships" (
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text NOT NULL,
	"granted_sequence" bigserial NOT NULL,
	CONSTRAINT "memberships_user_id_tenant_id_pk" PRIMARY KEY("user_id","tenant_id")
);

CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL
);

CREATE UNIQUE INDEX "api_keys_key_prefix_idx" ON "api_keys" USING btree ("key_prefix");
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
GRANT SELECT, INSERT, UPDATE ON TABLE users TO app_user;
GRANT SELECT, INSERT, UPDATE ON TABLE memberships TO app_user;
GRANT SELECT, INSERT, UPDATE ON TABLE api_keys TO app_user;
GRANT USAGE, SELECT ON SEQUENCE memberships_granted_sequence_seq TO app_user;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE users, memberships, api_keys FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE users, memberships, api_keys FROM authenticated;
  END IF;
END
$$;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;

CREATE POLICY users_registry_select ON users
  FOR SELECT USING (current_tenant_id() IS NULL);
CREATE POLICY users_registry_insert ON users
  FOR INSERT WITH CHECK (current_tenant_id() IS NULL);
CREATE POLICY users_registry_update ON users
  FOR UPDATE USING (current_tenant_id() IS NULL) WITH CHECK (current_tenant_id() IS NULL);

CREATE POLICY users_own_select ON users
  FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY users_own_insert ON users
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY users_own_update ON users
  FOR UPDATE USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY memberships_registry_select ON memberships
  FOR SELECT USING (current_tenant_id() IS NULL);
CREATE POLICY memberships_registry_insert ON memberships
  FOR INSERT WITH CHECK (current_tenant_id() IS NULL);
CREATE POLICY memberships_registry_update ON memberships
  FOR UPDATE USING (current_tenant_id() IS NULL) WITH CHECK (current_tenant_id() IS NULL);

CREATE POLICY memberships_own_select ON memberships
  FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY memberships_own_insert ON memberships
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY memberships_own_update ON memberships
  FOR UPDATE USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY api_keys_registry_select ON api_keys
  FOR SELECT USING (current_tenant_id() IS NULL);
CREATE POLICY api_keys_registry_insert ON api_keys
  FOR INSERT WITH CHECK (current_tenant_id() IS NULL);
CREATE POLICY api_keys_registry_update ON api_keys
  FOR UPDATE USING (current_tenant_id() IS NULL) WITH CHECK (current_tenant_id() IS NULL);

CREATE POLICY api_keys_own_select ON api_keys
  FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY api_keys_own_insert ON api_keys
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY api_keys_own_update ON api_keys
  FOR UPDATE USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
