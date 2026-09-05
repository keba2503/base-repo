const pathsRelativeToInfrastructurePackage = {
  schema: "./src/postgres/schema/index.ts",
  out: "./migrations",
} as const;

const drizzleConfig = {
  dialect: "postgresql",
  ...pathsRelativeToInfrastructurePackage,
  breakpoints: false,
  strict: true,
  verbose: true,
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
} as const;

export default drizzleConfig;
