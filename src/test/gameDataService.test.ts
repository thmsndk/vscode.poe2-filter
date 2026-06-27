import * as assert from "assert";
import { isInternalGameName } from "../services/gameDataService";

suite("Game Data Service Test Suite", () => {
  test("flags internal/dev names tagged with a leading bracket", () => {
    assert.ok(isInternalGameName("[DNT] Not Shown To Players"));
    assert.ok(isInternalGameName("[DNT-UNUSED] Axe Chop"));
    assert.ok(isInternalGameName("[DNT-Unused] Something"));
    assert.ok(isInternalGameName("[UNUSED] Heist Test Weapon"));
    assert.ok(isInternalGameName("  [DNT] leading whitespace"));
  });

  test("keeps real player-facing names", () => {
    assert.ok(!isInternalGameName("Exalted Orb"));
    assert.ok(!isInternalGameName("Ancient Longsword"));
    assert.ok(!isInternalGameName("Sapphire Ring"));
    assert.ok(!isInternalGameName(undefined));
  });
});
