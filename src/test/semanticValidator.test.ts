import * as assert from "assert";
import * as path from "path";
import { Parser } from "../language-server/ast/parser";
import { SemanticValidator } from "../language-server/validation/semanticValidator";
import { GameDataService } from "../services/gameDataService";

const mockGameData = new GameDataService();
// mockGameData.loadData("test/data");

suite("Semantic Validator Test Suite", () => {
  test("should suggest similar block keywords for misspellings", () => {
    const input = `
Sho
    BaseType "Mirror"
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.strictEqual(
      validator.diagnostics[0].message,
      'Invalid block keyword "Sho". Did you mean: Show?'
    );
    assert.strictEqual(validator.diagnostics[0].line, 2);
  });

  test("should suggest similar condition keywords for misspellings", () => {
    const input = `
Show
    ItemLvel 68
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.strictEqual(
      validator.diagnostics[0].message,
      'Unknown condition "ItemLvel". Did you mean: ItemLevel, GemLevel?'
    );
    assert.strictEqual(validator.diagnostics[0].line, 3);
  });

  test("should suggest similar action keywords for misspellings", () => {
    const input = `
Show
    SetBackgroundColr Brown
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.strictEqual(
      validator.diagnostics[0].message,
      'Unknown action "SetBackgroundColr". Did you mean: SetBackgroundColor?'
    );
    assert.strictEqual(validator.diagnostics[0].line, 3);
  });

  test("should report unknown condition/action without suggestions", () => {
    const input = `
Show
    UnknownConditionOrAction
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.strictEqual(
      validator.diagnostics[0].message,
      'Unknown keyword "UnknownConditionOrAction"'
    );
    assert.strictEqual(validator.diagnostics[0].line, 3);
  });

  test("should suggest both condition and action keywords when applicable", () => {
    const input = `
Show
    Size
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.strictEqual(
      validator.diagnostics[0].message,
      'Unknown keyword "Size". Did you mean: StackSize, SetFontSize?'
    );
    assert.strictEqual(validator.diagnostics[0].line, 3);
  });

  test("should validate color values", () => {
    const input = `
Show
    SetTextColor 999 0 0  # Invalid color value
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.strictEqual(
      validator.diagnostics[0].message,
      "Value 999 out of range [0,255] for parameter Red"
    );
    assert.strictEqual(validator.diagnostics[0].line, 3);
  });

  test("should report error for actions after Continue", () => {
    const mockGameData = new GameDataService();
    mockGameData.baseItemTypes = [
      { Name: "Mirror", Id: "Mirror", ItemClass: 1, DropLevel: 1 },
    ];

    const input = `
Show
    BaseType "Mirror"
    Continue
    SetBackgroundColor 0 0 0  # Should be invalid - no active block
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.strictEqual(
      validator.diagnostics[0].message,
      "Action not allowed after Continue statement"
    );
    assert.strictEqual(validator.diagnostics[0].line, 5);
  });

  test("should report error for conditions after Continue", () => {
    const mockGameData = new GameDataService();
    mockGameData.baseItemTypes = [
      { Name: "Mirror", Id: "Mirror", ItemClass: 1, DropLevel: 1 },
    ];

    const input = `
Show
    BaseType "Mirror"
    Continue
    ItemLevel > 68  # Should be invalid - no active block
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.strictEqual(
      validator.diagnostics[0].message,
      "Condition not allowed after Continue statement"
    );
    assert.strictEqual(validator.diagnostics[0].line, 5);
  });

  test("should correctly calculate positions for BaseType validation", () => {
    const input = `
Show
    BaseType == "Wrong Item" "Another Wrong"`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 2);

    // First value position
    assert.deepStrictEqual(
      {
        message: validator.diagnostics[0].message,
        line: 3,
        columnStart: 15,
        columnEnd: 26,
      },
      {
        message: 'BaseType "Wrong Item" not found',
        line: 3,
        columnStart: 15,
        columnEnd: 26,
      }
    );

    // Second value position
    assert.deepStrictEqual(
      {
        message: validator.diagnostics[1].message,
        line: 3,
        columnStart: 27,
        columnEnd: 41,
      },
      {
        message: 'BaseType "Another Wrong" not found',
        line: 3,
        columnStart: 27,
        columnEnd: 41,
      }
    );
  });

  test("should correctly calculate positions for Class validation", () => {
    const input = `
Show
    Class "Wrong Class" "Another Wrong Class"`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 2);

    // First value position
    assert.deepStrictEqual(
      {
        message: validator.diagnostics[0].message,
        line: 3,
        columnStart: 10,
        columnEnd: 22,
      },
      {
        message: 'Class "Wrong Class" not found',
        line: 3,
        columnStart: 10,
        columnEnd: 22,
      }
    );

    // Second value position
    assert.deepStrictEqual(
      {
        message: validator.diagnostics[1].message,
        line: 3,
        columnStart: 23,
        columnEnd: 43,
      },
      {
        message: 'Class "Another Wrong Class" not found',
        line: 3,
        columnStart: 23,
        columnEnd: 43,
      }
    );
  });

  test("should report duplicate values in Class condition", () => {
    const mockGameData = new GameDataService();
    mockGameData.itemClasses = [
      { Name: "Bow", _index: 0, Id: "Bow" },
      { Name: "Sword", _index: 1, Id: "Sword" },
    ];

    const input = `
Show
    Class "Bow" "Sword" "Bow"
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.deepStrictEqual(
      {
        message: validator.diagnostics[0].message,
        line: 3,
        columnStart: 23,
        columnEnd: 28,
      },
      {
        message: 'Duplicate value "Bow" in Class condition',
        line: 3,
        columnStart: 23,
        columnEnd: 28,
      }
    );
  });

  test("should report duplicate values in BaseType condition", () => {
    const mockGameData = new GameDataService();
    mockGameData.baseItemTypes = [
      { Name: "Mirror", Id: "Mirror", ItemClass: 1, DropLevel: 1 },
      { Name: "Mirror", Id: "Mirror", ItemClass: 1, DropLevel: 1 },
    ];

    const input = `
Show
    BaseType "Mirror" "Mirror"
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.deepStrictEqual(
      {
        message: validator.diagnostics[0].message,
        line: 3,
        columnStart: 21,
        columnEnd: 29,
      },
      {
        message: 'Duplicate value "Mirror" in BaseType condition',
        line: 3,
        columnStart: 21,
        columnEnd: 29,
      }
    );
  });

  test("should report duplicate values in non-BaseType/Class list conditions", () => {
    const input = `
Show
    HasInfluence "Shaper" "Elder" "Shaper"
`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.strictEqual(
      validator.diagnostics[0].message,
      'Duplicate value "Shaper" in HasInfluence condition'
    );
    assert.strictEqual(validator.diagnostics[0].severity, "warning");
  });
});

suite("Class/BaseType Combination", () => {
  const buildGameData = () => {
    const gameData = new GameDataService();
    gameData.itemClasses = [
      { _index: 0, Id: "Currency", Name: "Currency" },
      { _index: 1, Id: "Rings", Name: "Rings" },
    ];
    gameData.baseItemTypes = [
      { Id: "Exalted Orb", Name: "Exalted Orb", ItemClass: 0, DropLevel: 1 },
      { Id: "Sapphire Ring", Name: "Sapphire Ring", ItemClass: 1, DropLevel: 1 },
    ];
    return gameData;
  };

  const validate = (input: string) => {
    const ast = new Parser(input).parse();
    const validator = new SemanticValidator(buildGameData());
    validator.validate(ast);
    return validator.diagnostics;
  };

  test("warns on an impossible Class/BaseType combination", () => {
    const diagnostics = validate(`
Show
    Class == "Currency"
    BaseType == "Sapphire Ring"
    SetFontSize 40
`);
    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].severity, "warning");
    assert.strictEqual(diagnostics[0].line, 4);
    assert.strictEqual(
      diagnostics[0].message,
      'BaseType "Sapphire Ring" (Rings) does not match this block\'s Class condition'
    );
    assert.deepStrictEqual(diagnostics[0].tags, ["unnecessary"]);
  });

  test("attaches fix metadata for the impossible combination", () => {
    const diagnostics = validate(`
Show
    Class == "Currency"
    BaseType == "Sapphire Ring"
    SetFontSize 40
`);
    const data = diagnostics[0].data;
    if (!data) {
      assert.fail("expected fix metadata on the diagnostic");
      return;
    }
    assert.strictEqual(data.fix, "class-basetype-mismatch");
    assert.strictEqual(data.baseType, "Sapphire Ring");
    assert.deepStrictEqual(data.addClasses, ["Rings"]);
    // 0-based line of `    Class == "Currency"`.
    assert.strictEqual(data.classInsert.line, 2);
  });

  test("does not warn when the BaseType belongs to the Class", () => {
    const diagnostics = validate(`
Show
    Class == "Currency"
    BaseType == "Exalted Orb"
    SetFontSize 40
`);
    assert.deepStrictEqual(diagnostics, []);
  });

  test("does not warn when only one of Class/BaseType is present", () => {
    const diagnostics = validate(`
Show
    BaseType == "Sapphire Ring"
    SetFontSize 40
`);
    assert.deepStrictEqual(diagnostics, []);
  });
});

suite("DropLevel/BaseType Combination", () => {
  const buildGameData = () => {
    const gameData = new GameDataService();
    // Mirror drops at 35; the two ring bases bracket a 1-65 range.
    gameData.baseItemTypes = [
      { Id: "Mirror", Name: "Mirror of Kalandra", ItemClass: 0, DropLevel: 35 },
      { Id: "Iron Ring", Name: "Iron Ring", ItemClass: 1, DropLevel: 1 },
      { Id: "Gold Ring", Name: "Gold Ring", ItemClass: 1, DropLevel: 65 },
    ];
    return gameData;
  };

  const validate = (input: string) => {
    const ast = new Parser(input).parse();
    const validator = new SemanticValidator(buildGameData());
    validator.validate(ast);
    return validator.diagnostics;
  };

  test("warns when DropLevel can never match an exact BaseType", () => {
    const diagnostics = validate(`
Show
    BaseType == "Mirror of Kalandra"
    DropLevel < 35
    SetFontSize 40
`);
    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].severity, "warning");
    assert.strictEqual(diagnostics[0].line, 4);
    assert.strictEqual(
      diagnostics[0].message,
      "DropLevel < 35 never matches the block's BaseType: actual drop level 35"
    );
    assert.deepStrictEqual(diagnostics[0].tags, ["unnecessary"]);
  });

  test("reports the drop-level range for partial BaseType matches", () => {
    const diagnostics = validate(`
Show
    BaseType "Ring"
    DropLevel > 65
    SetFontSize 40
`);
    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(
      diagnostics[0].message,
      "DropLevel > 65 never matches the block's BaseType: actual drop level 1-65"
    );
  });

  test("does not warn when at least one base can satisfy the DropLevel", () => {
    const diagnostics = validate(`
Show
    BaseType "Ring"
    DropLevel >= 65
    SetFontSize 40
`);
    assert.deepStrictEqual(diagnostics, []);
  });

  test("does not warn for an exact DropLevel that matches a base", () => {
    const diagnostics = validate(`
Show
    BaseType == "Mirror of Kalandra"
    DropLevel 35
    SetFontSize 40
`);
    assert.deepStrictEqual(diagnostics, []);
  });

  test("skips unknown base types (reported separately)", () => {
    const diagnostics = validate(`
Show
    BaseType == "Totally Not An Item"
    DropLevel < 5
    SetFontSize 40
`);
    assert.ok(
      !diagnostics.some((d) => d.message.startsWith("DropLevel")),
      "should not emit a DropLevel cross-check for an unknown base"
    );
  });

  test("does not warn without a DropLevel condition", () => {
    const diagnostics = validate(`
Show
    BaseType == "Mirror of Kalandra"
    SetFontSize 40
`);
    assert.deepStrictEqual(diagnostics, []);
  });
});

suite("Import Validation", () => {
  test("warns when a non-Optional import is missing", () => {
    const input = `Import "definitely-missing-xyz.filter"\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData, __filename);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.match(
      validator.diagnostics[0].message,
      /Imported filter not found/
    );
    assert.strictEqual(validator.diagnostics[0].severity, "warning");
  });

  test("does not warn for Optional imports", () => {
    const input = `Import "definitely-missing-xyz.filter" Optional\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData, __filename);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 0);
  });

  test("does not warn when the imported file exists", () => {
    const input = `Import "${path.basename(__filename)}"\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData, __filename);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 0);
  });
});

suite("Boolean Condition Hints", () => {
  test('suggests the simpler form for "Corrupted != True"', () => {
    const input = `\nShow\n    Corrupted != True\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.strictEqual(
      validator.diagnostics[0].message,
      '"Corrupted != True" is confusing. Use "Corrupted False" instead.'
    );
    assert.strictEqual(validator.diagnostics[0].severity, "warning");
  });

  test('suggests the simpler form for "Mirrored ! False"', () => {
    const input = `\nShow\n    Mirrored ! False\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.strictEqual(
      validator.diagnostics[0].message,
      '"Mirrored ! False" is confusing. Use "Mirrored True" instead.'
    );
  });

  test("does not warn for the plain boolean form", () => {
    const input = `\nShow\n    Corrupted True\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 0);
  });
});

suite("HasExplicitMod Validation", () => {
  test("flags a space between the operator and count", () => {
    const input = `\nShow\n    HasExplicitMod >= 6 "Mod"\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.strictEqual(
      validator.diagnostics[0].message,
      'HasExplicitMod requires no space between the operator and number. Use ">=6".'
    );
    assert.strictEqual(validator.diagnostics[0].severity, "error");
  });

  test("accepts the glued operator/count form", () => {
    const input = `\nShow\n    HasExplicitMod >=6 "Mod"\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 0);
    assert.strictEqual(parser.diagnostics.length, 0);
  });

  test("accepts a mod list with no count", () => {
    const input = `\nShow\n    HasExplicitMod "Mod A" "Mod B"\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 0);
    assert.strictEqual(parser.diagnostics.length, 0);
  });
});

suite("Disabled-value Actions", () => {
  test('does not validate parameters for "PlayAlertSound None"', () => {
    const input = `\nShow\n    PlayAlertSound None\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 0);
  });

  test('does not validate parameters for "PlayEffect None"', () => {
    const input = `\nShow\n    PlayEffect None\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 0);
  });
});

suite("CustomAlertSound Validation", () => {
  test("errors when a CustomAlertSound file is missing", () => {
    const input = `\nShow\n    CustomAlertSound "definitely-missing-xyz.wav"\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData, __filename);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.match(validator.diagnostics[0].message, /Sound file not found/);
    assert.strictEqual(validator.diagnostics[0].severity, "error");
  });

  test("warns (not errors) for a missing CustomAlertSoundOptional file", () => {
    const input = `\nShow\n    CustomAlertSoundOptional "definitely-missing-xyz.wav"\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData, __filename);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 1);
    assert.strictEqual(validator.diagnostics[0].severity, "warning");
  });

  test('skips validation when the sound is disabled with "None"', () => {
    const input = `\nShow\n    CustomAlertSound None\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData, __filename);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 0);
  });

  test("does not warn when the sound file exists", () => {
    const input = `\nShow\n    CustomAlertSound "${path.basename(__filename)}"\n`;
    const parser = new Parser(input);
    const ast = parser.parse();

    const validator = new SemanticValidator(mockGameData, __filename);
    validator.validate(ast);

    assert.strictEqual(validator.diagnostics.length, 0);
  });

  suite("PlayEffect Temp keyword", () => {
    const validate = (line: string) => {
      const ast = new Parser(`\nShow\n    ${line}\n`).parse();
      const validator = new SemanticValidator(mockGameData);
      validator.validate(ast);
      return validator.diagnostics;
    };

    test("accepts the literal Temp keyword", () => {
      assert.deepStrictEqual(validate("PlayEffect Red Temp"), []);
    });

    test("accepts PlayEffect without the optional Temp keyword", () => {
      assert.deepStrictEqual(validate("PlayEffect Red"), []);
    });

    test("rejects any other word in place of Temp", () => {
      const diagnostics = validate("PlayEffect Red Foo");
      assert.strictEqual(diagnostics.length, 1);
      assert.strictEqual(
        diagnostics[0].message,
        'Invalid value "Foo" for PlayEffect. Expected "Temp"'
      );
    });
  });

  suite("Duplicate conditions and actions in a block", () => {
    const validate = (input: string) => {
      const ast = new Parser(input).parse();
      const validator = new SemanticValidator(mockGameData);
      validator.validate(ast);
      return validator.diagnostics;
    };

    test("does not warn on a numeric range bracket (conditions compound/AND)", () => {
      // FilterBlade routinely brackets a band like this; both bounds apply.
      const diagnostics = validate(`
Show
    ItemLevel >= 65
    ItemLevel <= 81
    SetFontSize 40
`);
      assert.deepStrictEqual(diagnostics, []);
    });

    test("errors on a numeric range that can never match", () => {
      const diagnostics = validate(`
Show
    ItemLevel >= 80
    ItemLevel <= 10
    SetFontSize 40
`);
      assert.strictEqual(diagnostics.length, 1);
      assert.strictEqual(diagnostics[0].severity, "error");
      assert.strictEqual(diagnostics[0].line, 4);
      assert.strictEqual(
        diagnostics[0].message,
        "This block can never match: its ItemLevel conditions contradict each other (no value satisfies all of them)"
      );
    });

    test("errors on mutually exclusive Rarity conditions", () => {
      const diagnostics = validate(`
Show
    Rarity Normal
    Rarity Magic
    SetFontSize 40
`);
      assert.strictEqual(diagnostics.length, 1);
      assert.strictEqual(diagnostics[0].severity, "error");
      assert.strictEqual(
        diagnostics[0].message,
        "This block can never match: its Rarity conditions contradict each other (no value satisfies all of them)"
      );
    });

    test("does not warn on a valid Rarity range (>= and <=)", () => {
      const diagnostics = validate(`
Show
    Rarity >= Magic
    Rarity <= Rare
    SetFontSize 40
`);
      assert.deepStrictEqual(diagnostics, []);
    });

    test("errors on contradictory boolean conditions", () => {
      const diagnostics = validate(`
Show
    Corrupted True
    Corrupted False
    SetFontSize 40
`);
      assert.strictEqual(diagnostics.length, 1);
      assert.strictEqual(diagnostics[0].severity, "error");
      assert.strictEqual(
        diagnostics[0].message,
        "This block can never match: its Corrupted conditions contradict each other (no value satisfies all of them)"
      );
    });

    test("warns on a redundant condition that does not narrow the others", () => {
      const diagnostics = validate(`
Show
    ItemLevel >= 60
    ItemLevel >= 70
    SetFontSize 40
`);
      assert.strictEqual(diagnostics.length, 1);
      assert.strictEqual(diagnostics[0].severity, "warning");
      assert.strictEqual(diagnostics[0].line, 3);
      assert.strictEqual(
        diagnostics[0].message,
        "Redundant ItemLevel condition: another ItemLevel condition in this block already covers it"
      );
      assert.deepStrictEqual(diagnostics[0].tags, ["unnecessary"]);
    });

    test("errors on two different exact BaseTypes (an item has one base)", () => {
      const gameData = new GameDataService();
      gameData.baseItemTypes = [
        { Id: "Exalted Orb", Name: "Exalted Orb", ItemClass: 0, DropLevel: 1 },
        { Id: "Chaos Orb", Name: "Chaos Orb", ItemClass: 0, DropLevel: 1 },
      ];
      const ast = new Parser(`
Show
    BaseType == "Exalted Orb"
    BaseType == "Chaos Orb"
    SetFontSize 40
`).parse();
      const validator = new SemanticValidator(gameData);
      validator.validate(ast);

      assert.strictEqual(validator.diagnostics.length, 1);
      assert.strictEqual(validator.diagnostics[0].severity, "error");
      assert.strictEqual(
        validator.diagnostics[0].message,
        "This block can never match: its BaseType conditions contradict each other (no value satisfies all of them)"
      );
    });

    test("warns on the overridden earlier action (only the last applies)", () => {
      const diagnostics = validate(`
Show
    SetFontSize 30
    SetFontSize 40
`);
      assert.strictEqual(diagnostics.length, 1);
      assert.strictEqual(diagnostics[0].severity, "warning");
      assert.strictEqual(diagnostics[0].line, 3);
      assert.strictEqual(
        diagnostics[0].message,
        'Duplicate action "SetFontSize": only the last SetFontSize in a block is applied'
      );
    });

    test("does not warn on distinct conditions and actions", () => {
      const diagnostics = validate(`
Show
    ItemLevel >= 60
    Quality >= 10
    SetFontSize 40
    SetTextColor 255 0 0
`);
      assert.deepStrictEqual(diagnostics, []);
    });

    test("ignores commented-out duplicates", () => {
      const diagnostics = validate(`
Show
    SetFontSize 40
    # SetFontSize 30
`);
      assert.deepStrictEqual(diagnostics, []);
    });
  });

  suite("Dead-code tags", () => {
    const validate = (input: string) => {
      const ast = new Parser(input).parse();
      const validator = new SemanticValidator(mockGameData);
      validator.validate(ast);
      return validator.diagnostics;
    };

    test("tags statements after Continue as unnecessary", () => {
      const diagnostics = validate(`
Show
    Quality > 0
    Continue
    SetFontSize 40
`);
      assert.strictEqual(diagnostics.length, 1);
      assert.match(diagnostics[0].message, /after Continue/);
      assert.deepStrictEqual(diagnostics[0].tags, ["unnecessary"]);
    });

    test("tags overridden duplicate actions as unnecessary", () => {
      const diagnostics = validate(`
Show
    SetFontSize 30
    SetFontSize 40
`);
      assert.strictEqual(diagnostics.length, 1);
      assert.deepStrictEqual(diagnostics[0].tags, ["unnecessary"]);
    });

    test("tags redundant duplicate conditions as unnecessary", () => {
      const diagnostics = validate(`
Show
    ItemLevel >= 60
    ItemLevel >= 70
    SetFontSize 40
`);
      assert.strictEqual(diagnostics.length, 1);
      assert.deepStrictEqual(diagnostics[0].tags, ["unnecessary"]);
    });
  });
});
