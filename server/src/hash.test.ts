import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalCardJson,
  computeRouteHashHex,
  profileDataHash,
  type CardHashInput,
} from "./hash";

const fixed: CardHashInput = {
  cardId: "11111111-1111-4111-8111-111111111111",
  from: "alice",
  to: "bob",
  salt: "000102030405060708090a0b0c0d0e0f",
  route: {
    // title is NOT part of the hash; mode omitted -> defaults to "walk"
    points: [
      { lat: 6.5244, lng: 3.3792, label: "  Ikeja Bus Stop ", note: "Take the left gate" },
      { lat: 6.4474, lng: 3.3903, label: "Lekki Market" },
    ],
  },
};

const EXPECTED_CANONICAL =
  '{"v":1,"cardId":"11111111-1111-4111-8111-111111111111","from":"alice","to":"bob",' +
  '"salt":"000102030405060708090a0b0c0d0e0f","mode":"walk","points":[' +
  '{"lat":"6.524400","lng":"3.379200","label":"Ikeja Bus Stop","note":"Take the left gate"},' +
  '{"lat":"6.447400","lng":"3.390300","label":"Lekki Market","note":""}]}';

const EXPECTED_HASH = "93cd57f8843bb6cb2a99d58bd1f109e8a29b58ef95234125ab79f7bd1922cdd7";

test("canonical JSON is exact (key order, 6-decimal strings, trimmed, defaults)", () => {
  assert.equal(canonicalCardJson(fixed), EXPECTED_CANONICAL);
});

test("fixed example produces the expected SHA-256", () => {
  assert.equal(computeRouteHashHex(fixed), EXPECTED_HASH);
});

test("changing one label changes the hash", () => {
  const changed: CardHashInput = {
    ...fixed,
    route: {
      points: [
        fixed.route.points[0],
        { ...fixed.route.points[1], label: "Lekki Market 2" },
      ],
    },
  };
  assert.notEqual(computeRouteHashHex(changed), EXPECTED_HASH);
});

test("a different salt changes the hash", () => {
  const other = { ...fixed, salt: "ffffffffffffffffffffffffffffffff" };
  assert.notEqual(computeRouteHashHex(other), EXPECTED_HASH);
});

test("NFC normalisation: composed and decomposed labels hash the same", () => {
  const composed = { ...fixed, route: { points: [{ lat: 1, lng: 2, label: "caf\u00e9" }] } };
  const decomposed = { ...fixed, route: { points: [{ lat: 1, lng: 2, label: "cafe\u0301" }] } };
  assert.equal(computeRouteHashHex(composed), computeRouteHashHex(decomposed));
});

test("numeric strings and numbers format identically", () => {
  const a = { ...fixed, route: { points: [{ lat: 6.5244, lng: 3.3792 }] } };
  const b = { ...fixed, route: { points: [{ lat: "6.5244", lng: "3.3792" }] } };
  assert.equal(computeRouteHashHex(a), computeRouteHashHex(b));
});

test("profile dataHash is SHA-256 of {handle, avatarId}", () => {
  assert.equal(
    profileDataHash("alice", 3).toString("hex"),
    "33812a6e75a80245015b2229d77acbd0825e0aafab2dca2c8840b44ca4873181",
  );
});
