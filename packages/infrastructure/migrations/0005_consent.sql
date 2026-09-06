CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"subject_id" uuid NOT NULL,
	"category" text NOT NULL,
	"policy_version" text NOT NULL,
	"granted_at" timestamp with time zone NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"source_ip_address" text NOT NULL,
	"source_user_agent" text NOT NULL
);

CREATE INDEX "consents_tenant_subject_category_idx" ON "consents" USING btree ("tenant_id","subject_id","category");

GRANT SELECT, INSERT, UPDATE ON TABLE consents TO app_user;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE consents FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE consents FROM authenticated;
  END IF;
END
$$;

ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents FORCE ROW LEVEL SECURITY;

CREATE POLICY consents_platform_all ON consents
  FOR ALL USING (current_tenant_id() IS NULL) WITH CHECK (current_tenant_id() IS NULL);
CREATE POLICY consents_own_all ON consents
  FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());