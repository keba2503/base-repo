CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"original_filename" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"status" text NOT NULL,
	"extracted_text" text,
	"failure_reason" text,
	"processed_at" timestamp with time zone
);

CREATE INDEX "documents_tenant_created_idx" ON "documents" USING btree ("tenant_id","created_at");

GRANT SELECT, INSERT, UPDATE ON TABLE documents TO app_user;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE documents FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE documents FROM authenticated;
  END IF;
END
$$;

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;

CREATE POLICY documents_platform_all ON documents
  FOR ALL USING (current_tenant_id() IS NULL) WITH CHECK (current_tenant_id() IS NULL);
CREATE POLICY documents_own_all ON documents
  FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());