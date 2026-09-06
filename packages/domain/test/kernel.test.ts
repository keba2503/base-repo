import { describe, expect, it } from "bun:test";
import { classify, fieldsClassifiedAs } from "../src/kernel/classification";
import { conflict, forbidden, invariantViolation, notFound, unavailable } from "../src/kernel/domain-error";
import { entityIdOf, parseEntityId, parseTenantId, tenantIdOf } from "../src/kernel/identifiers";
import { andThen, err, isErr, isOk, map, ok } from "../src/kernel/result";
import { isDeleted } from "../src/kernel/soft-deletable";
import { tenantIdFactory } from "./factories/tenant";

describe("result", () => {
  it("maps the value of a success", () => {
    const result = map(ok(2), (value) => value * 3);
    expect(result).toEqual(ok(6));
  });

  it("leaves a failure untouched when mapping", () => {
    const failure = err(invariantViolation("code", "message"));
    expect(map(failure, () => 1)).toBe(failure);
  });

  it("chains a success into the next step", () => {
    const result = andThen(ok(2), (value) => ok(value + 1));
    expect(result).toEqual(ok(3));
  });

  it("short circuits a chain on failure", () => {
    const failure = err(notFound("code", "message"));
    expect(andThen(failure, () => ok(1))).toBe(failure);
  });

  it("narrows a success with isOk", () => {
    expect(isOk(ok("value"))).toBe(true);
  });

  it("narrows a failure with isErr", () => {
    expect(isErr(err("boom"))).toBe(true);
  });
});

describe("domain error", () => {
  it("tags every constructor with its kind", () => {
    expect([
      invariantViolation("a", "a").kind,
      notFound("b", "b").kind,
      conflict("c", "c").kind,
      forbidden("d", "d").kind,
      unavailable("e", "e").kind,
    ]).toEqual(["invariantViolation", "notFound", "conflict", "forbidden", "unavailable"]);
  });
});

describe("identifiers", () => {
  it("accepts a lowercase uuid", () => {
    expect(isOk(parseEntityId("6f1a2b3c-4d5e-4f60-8a1b-2c3d4e5f6071"))).toBe(true);
  });

  it("rejects a value that is not a uuid", () => {
    expect(isErr(parseEntityId("not-a-uuid"))).toBe(true);
  });

  it("rejects an empty tenant id", () => {
    expect(isErr(parseTenantId(""))).toBe(true);
  });

  it("converts between entity and tenant identity", () => {
    const id = tenantIdFactory(7);
    expect(tenantIdOf(entityIdOf(id))).toBe(id);
  });
});

describe("classification", () => {
  it("lists the fields of a given classification", () => {
    const classifications = classify<{ email: string; id: string }>({ email: "personal", id: "none" });
    expect(fieldsClassifiedAs(classifications, "personal")).toEqual(["email"]);
  });
});

describe("soft deletable", () => {
  it("reports a marked entity as deleted", () => {
    expect(isDeleted({ deletedAt: new Date() })).toBe(true);
  });

  it("reports an unmarked entity as alive", () => {
    expect(isDeleted({ deletedAt: null })).toBe(false);
  });
});
