import { isOk, parseEmail, parseEntityId } from "@base/domain";
import { SupabaseFileStore, SupabaseIdentityProvider } from "@base/infrastructure";
import { createClient } from "@supabase/supabase-js";
import { describeFileStoreContract, describeIdentityProviderContract, type IssuedSession } from "./contracts/index";

const requiredVariables = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_TEST_EMAIL", "SUPABASE_TEST_PASSWORD"] as const;

const missing = requiredVariables.filter((name) => (process.env[name] ?? "").length === 0);

if (missing.length > 0) {
  console.warn(
    `Skipping the SupabaseIdentityProvider contract suite: set ${missing.join(", ")} to run it against a real project`,
  );
} else {
  const url = process.env.SUPABASE_URL ?? "";
  const anonKey = process.env.SUPABASE_ANON_KEY ?? "";
  const testEmail = process.env.SUPABASE_TEST_EMAIL ?? "";
  const testPassword = process.env.SUPABASE_TEST_PASSWORD ?? "";

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  async function issueSession(): Promise<IssuedSession> {
    const signedIn = await client.auth.signInWithPassword({ email: testEmail, password: testPassword });
    if (signedIn.error) throw new Error(`The test user could not sign in: ${signedIn.error.message}`);
    const subjectId = parseEntityId(signedIn.data.user.id);
    const email = parseEmail(signedIn.data.user.email ?? "");
    if (!isOk(subjectId) || !isOk(email)) throw new Error("The test user has no usable id or email");
    return { token: signedIn.data.session.access_token, subjectId: subjectId.value, email: email.value };
  }

  describeIdentityProviderContract("SupabaseIdentityProvider", () => ({
    provider: new SupabaseIdentityProvider({ client }),
    issueSession,
  }));
}

const storageRequiredVariables = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_STORAGE_BUCKET"] as const;

const missingStorageVariables = storageRequiredVariables.filter((name) => (process.env[name] ?? "").length === 0);

if (missingStorageVariables.length > 0) {
  console.warn(
    `Skipping the SupabaseFileStore contract suite: set ${missingStorageVariables.join(", ")} to run it against a real project`,
  );
} else {
  const url = process.env.SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "";

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  describeFileStoreContract("SupabaseFileStore", () => ({ store: new SupabaseFileStore({ client, bucket }) }));
}
