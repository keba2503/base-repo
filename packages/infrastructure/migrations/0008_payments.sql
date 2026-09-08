CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"initiated_by" uuid NOT NULL,
	"provider" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"description" text NOT NULL,
	"status" text NOT NULL,
	"provider_reference" text,
	"resolved_at" timestamp with time zone,
	"failure_reason" text,
	CONSTRAINT "payments_amount_minor_check" CHECK ("amount_minor" > 0),
	CONSTRAINT "payments_currency_check" CHECK (char_length("currency") = 3),
	CONSTRAINT "payments_status_check" CHECK ("status" IN ('pending', 'succeeded', 'failed', 'canceled'))
);

CREATE INDEX "payments_tenant_created_idx" ON "payments" USING btree ("tenant_id","created_at");
CREATE UNIQUE INDEX "payments_provider_reference_idx" ON "payments" USING btree ("provider","provider_reference") WHERE "payments"."provider_reference" is not null;

GRANT SELECT, INSERT, UPDATE ON TABLE payments TO app_user;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE payments FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE payments FROM authenticated;
  END IF;
END
$$;

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;

CREATE POLICY payments_platform_all ON payments
  FOR ALL USING (current_tenant_id() IS NULL) WITH CHECK (current_tenant_id() IS NULL);
CREATE POLICY payments_own_all ON payments
  FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());