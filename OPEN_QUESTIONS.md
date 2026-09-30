# Open Design Questions

These are deliberately left configurable instead of being silently decided during implementation.

## Board rules

- Exact board dimensions?
- Exact five Power Point locations?
- Are there light/dark board cells with gameplay effects?
- Are all creatures allowed on all cells?
- How exactly are Power Points captured/contested?
- Can a creature move through another creature?
- Can a creature move diagonally?

## Movement

- Is Speed exactly movement range?
- Can movement stop early?
- Does entering an enemy cell always trigger combat?
- Are there terrain/movement modifiers?

## Dice

- Does every creature always have exactly five allocation slots?
- Can a creature have multiple dice in one stat?
- Are all dice standard d6?
- Does the player see the opponent's final dice before combat?
- Can players allocate dice in any order?

## Combat

- Is combat fully real-time?
- Does Speed affect combat movement/attack rate?
- What exactly does Power mean numerically?
- What exactly does Shield reduce?
- What does Block do?
- Can combat time out?
- Can both creatures die simultaneously?

## Special

- Can Specials activate automatically?
- Can Specials be activated manually after satisfying the requirement?
- Can a Special be used once or repeatedly?
- Are Special effects temporary for the battle?
- Can Specials alter movement, projectiles, health, or the arena?

## Persistent HP

- Is there any healing outside battle?
- Can a Power Point heal its owner?
- Can a creature with 1 HP participate normally?
- Can a creature ever recover before the match ends?

## Roster

- How many creatures per player?
- Are both players allowed to use the same creature?
- Are factions purely cosmetic or mechanically different?
- Can players build custom rosters?

## Editor

- Should the editor allow custom combat effects beyond predefined effects?
- Should content packs be shareable?
- Should the editor have a balance/debug simulator?

## Important implementation rule

Until these questions are decided, implement systems so that the answer can be changed through configuration/data where practical.

Do not hard-code assumptions into unrelated systems.
