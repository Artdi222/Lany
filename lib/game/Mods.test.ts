import { describe, expect, test } from "bun:test";
import { isUnranked, modRate, scoreMultiplier, toggleMod, windowScale, hpLossScale } from "./Mods";

describe("toggleMod", () => {
  test("adds and removes", () => {
    expect(toggleMod([], "HD")).toEqual(["HD"]);
    expect(toggleMod(["HD"], "HD")).toEqual([]);
  });
  test("speed mods are exclusive", () => {
    expect(toggleMod(["HT", "HD"], "DT")).toEqual(["DT", "HD"]);
    expect(toggleMod(["DT"], "NC")).toEqual(["NC"]);
  });
  test("fail mods are exclusive", () => {
    expect(toggleMod(["NF", "EZ"], "SD")).toEqual(["EZ", "SD"]);
  });
  test("output keeps catalog order", () => {
    expect(toggleMod(["HD"], "EZ")).toEqual(["EZ", "HD"]);
  });
});

test("rate / windows / hp / multiplier", () => {
  expect(modRate([])).toBe(1);
  expect(modRate(["HT"])).toBe(0.75);
  expect(modRate(["NC", "HD"])).toBe(1.5);
  expect(windowScale(["EZ"])).toBe(1.4);
  expect(hpLossScale(["HD"])).toBe(1);
  expect(scoreMultiplier(["EZ", "NF"])).toBe(0.25);
  expect(scoreMultiplier(["DT", "HD"])).toBe(1);
});

test("customise: custom rate, clamped to the speed mod's range, makes the play unranked", () => {
  expect(modRate(["DT"], 1.63)).toBe(1.63);
  expect(modRate(["HT"], 1.5)).toBe(0.99);
  expect(modRate(["HD"], 1.63)).toBe(1);
  expect(isUnranked(["DT"], 1.63)).toBe(true);
  expect(isUnranked(["DT"], 1.5)).toBe(false);
  expect(isUnranked(["HD"], 1.63)).toBe(false);
  expect(isUnranked(["NC"], null)).toBe(false);
});
