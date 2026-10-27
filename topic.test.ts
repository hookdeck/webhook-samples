import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { resolveTopic, safeStem, scalarOrUndefined } from "./topic";

describe("resolveTopic", () => {
  it("resolves a plain key", () => {
    assert.equal(resolveTopic({ event: "charge.succeeded" }, "event"), "charge.succeeded");
  });

  it("resolves a dotted path", () => {
    assert.equal(resolveTopic({ data: { type: "invoice.paid" } }, "data.type"), "invoice.paid");
  });

  it("resolves an array segment using the first element", () => {
    const body = { events: [{ eventType: "user.created" }, { eventType: "user.deleted" }] };
    assert.equal(resolveTopic(body, "events[].eventType"), "user.created");
  });

  it("resolves nested array segments", () => {
    const body = { entry: [{ changes: [{ field: "messages" }] }] };
    assert.equal(resolveTopic(body, "entry[].changes[].field"), "messages");
  });

  it("resolves an array segment nested under a dotted path", () => {
    const body = { data: { events: [{ eventType: "user.lifecycle.activate" }] } };
    assert.equal(resolveTopic(body, "data.events[].eventType"), "user.lifecycle.activate");
  });

  it("resolves a top-level array when the segment name before [] is empty", () => {
    const body = [{ type: "qbo.account.created.v1" }, { type: "qbo.account.updated.v1" }];
    assert.equal(resolveTopic(body, "[].type"), "qbo.account.created.v1");
  });

  it("returns undefined for [] when the body is not an array", () => {
    assert.equal(resolveTopic({ type: "x" }, "[].type"), undefined);
  });

  // A header called "x-thing.type" is a real key, not a path into "x-thing".
  it("prefers a literal key over interpreting it as a path", () => {
    const headers = { "data.type": "literal", data: { type: "viaPath" } };
    assert.equal(resolveTopic(headers, "data.type"), "literal");
  });

  it("returns undefined when the path lands on an object", () => {
    assert.equal(resolveTopic({ data: { type: { nested: true } } }, "data.type"), undefined);
  });

  it("returns undefined when an array segment finds no array", () => {
    assert.equal(resolveTopic({ events: { eventType: "x" } }, "events[].eventType"), undefined);
  });

  it("returns undefined for an empty array", () => {
    assert.equal(resolveTopic({ events: [] }, "events[].eventType"), undefined);
  });

  it("returns undefined when the path breaks part way", () => {
    assert.equal(resolveTopic({ data: null }, "data.type"), undefined);
    assert.equal(resolveTopic({}, "a.b.c"), undefined);
  });

  it("returns undefined for a null or undefined source", () => {
    assert.equal(resolveTopic(null, "event"), undefined);
    assert.equal(resolveTopic(undefined, "event"), undefined);
  });

  it("coerces a numeric value to a string", () => {
    assert.equal(resolveTopic({ data: { type: 42 } }, "data.type"), "42");
  });
});

describe("scalarOrUndefined", () => {
  it("passes through strings and stringifies numbers", () => {
    assert.equal(scalarOrUndefined("a"), "a");
    assert.equal(scalarOrUndefined(0), "0");
  });

  it("rejects anything that would stringify to [object Object]", () => {
    assert.equal(scalarOrUndefined({}), undefined);
    assert.equal(scalarOrUndefined([]), undefined);
    assert.equal(scalarOrUndefined(null), undefined);
    assert.equal(scalarOrUndefined(undefined), undefined);
    assert.equal(scalarOrUndefined(true), undefined);
  });
});

// Each case is a topic whose doc sample is already in providers/ under the registry's
// stem, so a capture of the same event has to be written to that same file.
describe("safeStem", () => {
  const cases: [string, string, string][] = [
    ["pubnub/latest", "pubnub.com/schemas/events/channel.created?v=1.0.0",
      "pubnub.com.schemas.events.channel.created.v.1.0.0"],
    ["mailtrap/latest", "soft bounce", "soft.bounce"],
    ["descope/latest", "Change Password", "Change.Password"],
    ["document360/latest", "Extension token deleted", "Extension.token.deleted"],
    ["flexport/latest", "/shipment_leg#departed", "shipment_leg.departed"],
    ["castle/v1", "$list_item.created", "list_item.created"],
  ];

  for (const [dir, topic, stem] of cases) {
    it(`names ${JSON.stringify(topic)} as the registry does (${dir}/${stem}.json)`, () => {
      assert.equal(safeStem(topic), stem);
      assert.ok(existsSync(join(__dirname, "providers", dir, `${stem}.json`)));
    });
  }

  it("collapses a run of unsafe characters into one dot", () => {
    assert.equal(safeStem("a :/\\ b"), "a.b");
  });

  it("keeps dots, dashes and underscores", () => {
    assert.equal(safeStem("charge.succeeded_v-2"), "charge.succeeded_v-2");
  });

  it("strips leading and trailing dots", () => {
    assert.equal(safeStem("..a.."), "a");
  });

  it("never returns an empty stem", () => {
    assert.equal(safeStem("///"), "_unnamed");
  });
});
