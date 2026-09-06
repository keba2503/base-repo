CREATE TABLE "jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"completed_at" timestamp with time zone,
	"exhausted_at" timestamp with time zone
);

CREATE INDEX "jobs_due_idx" ON "jobs" USING btree ("run_at","id") WHERE "jobs"."completed_at" is null and "jobs"."exhausted_at" is null;

GRANT SELECT, INSERT, UPDATE ON TABLE jobs TO app_user;
GRANT USAGE, SELECT ON SEQUENCE jobs_id_seq TO app_user;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE jobs FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE jobs FROM authenticated;
  END IF;
END
$$;

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs FORCE ROW LEVEL SECURITY;

CREATE POLICY jobs_platform_all ON jobs
  FOR ALL USING (current_tenant_id() IS NULL) WITH CHECK (current_tenant_id() IS NULL);
CREATE POLICY jobs_own_all ON jobs
  FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());