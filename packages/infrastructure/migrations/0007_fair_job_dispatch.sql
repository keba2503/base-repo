DROP INDEX "jobs_due_idx";
ALTER TABLE "jobs" ADD COLUMN "priority" smallint DEFAULT 1 NOT NULL;
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_priority_check" CHECK ("priority" IN (0, 1));
CREATE INDEX "jobs_dispatch_idx" ON "jobs" USING btree ("tenant_id","priority","run_at","id") WHERE "jobs"."completed_at" is null and "jobs"."exhausted_at" is null;