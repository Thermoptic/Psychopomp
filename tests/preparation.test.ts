import { describe, expect, it } from 'vitest';
import { applyCommand, type GameEvent, type GameState, type PlayerId } from '../src/core';
import { boardLayout } from '../src/rendering/layout';
import { boardUnits } from '../src/rendering/boardUnits';
import { prepButton } from '../src/rendering/prepModel';
import { customMatch, fightToResult, ok, prepOf, quickPrepare, runCountdown, testCreature } from './helpers';

const fixed = (id: string, stats: Parameters<typeof testCreature>[1] = {}) =>
  testCreature(id, stats, { dice: { sides: 1, slots: { speed: 1, power: 1, shield: 1, special: 1, block: 1 } } });

/** 9×9 match where P1-a-1 (3,2) can attack P2-b-1 (5,2); P2-b-2 can later attack. */
function match(): GameState {
  return customMatch({
    width: 9,
    height: 9,
    powerPoints: [
      { x: 4, y: 0 },
      { x: 4, y: 8 },
    ],
    creatures: [fixed('a', { power: 30 }), fixed('b', { power: 2 })],
    placements: [
      { creature: 'a', owner: 'P1', x: 3, y: 2 },
      { creature: 'a', owner: 'P1', x: 0, y: 8 },
      { creature: 'b', owner: 'P2', x: 5, y: 2 },
      { creature: 'b', owner: 'P2', x: 7, y: 2 },
    ],
  });
}

const startBattle = () => ok(match(), { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 5, y: 2 } });

function place(s: GameState, player: PlayerId, count = 5): GameState {
  for (let i = 0; i < count; i++) s = ok(s, { type: 'ALLOCATE_DIE', die: i, slot: i, player });
  return s;
}

/** Applies commands and collects all events. */
function run(s: GameState, cmds: Parameters<typeof applyCommand>[1][]): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  for (const c of cmds) {
    const r = applyCommand(s, c);
    if (r.error) throw new Error(`${c.type}: ${r.error}`);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

describe('simultaneous battle preparation', () => {
  it('1. P1 and P2 both start preparing at once (dice rolled, REROLL shown)', () => {
    const s = startBattle();
    expect(s.battle!.stage).toBe('dice');
    for (const p of ['P1', 'P2'] as const) {
      expect(prepOf(s, p).stage).toBe('roll');
      expect(prepOf(s, p).dice.every((v) => v > 0)).toBe(true);
      expect(prepButton(prepOf(s, p)).kind).toBe('reroll');
    }
    // Either player may act first; interleaving is fine.
    let t = ok(s, { type: 'LOCK_DIE', die: 0, player: 'P2' });
    t = ok(t, { type: 'LOCK_DIE', die: 1, player: 'P1' });
    t = ok(t, { type: 'REROLL', player: 'P2' });
    t = ok(t, { type: 'ALLOCATE_DIE', die: 0, slot: 0, player: 'P1' });
    expect(prepOf(t, 'P1').stage).toBe('allocate');
    expect(prepOf(t, 'P2').stage).toBe('roll');
  });

  it('2. P1 can be READY while P2 is still placing dice', () => {
    let s = quickPrepare(startBattle(), 'P1');
    s = place(s, 'P2', 2);
    expect(prepOf(s, 'P1').stage).toBe('done');
    expect(prepOf(s, 'P2').stage).toBe('allocate');
    expect(s.battle!.stage).toBe('dice');
    s = ok(s, { type: 'UNALLOCATE_DIE', slot: 1, player: 'P2' });
    s = ok(s, { type: 'ALLOCATE_DIE', die: 1, slot: 4, player: 'P2' });
    expect(prepOf(s, 'P2').slotDice).toEqual([0, null, null, null, 1]);
  });

  it('3. ...and the opposite: P2 READY while P1 still rolls and places', () => {
    let s = quickPrepare(startBattle(), 'P2');
    expect(prepOf(s, 'P2').stage).toBe('done');
    s = ok(s, { type: 'LOCK_DIE', die: 3, player: 'P1' });
    s = ok(s, { type: 'REROLL', player: 'P1' });
    s = place(s, 'P1', 3);
    expect(prepOf(s, 'P1').stage).toBe('allocate');
    expect(s.battle!.stage).toBe('dice');
  });

  it('4. APPLY is disabled until every die is placed', () => {
    let s = startBattle();
    for (let n = 0; n < 5; n++) {
      if (n > 0) s = ok(s, { type: 'ALLOCATE_DIE', die: n - 1, slot: n - 1, player: 'P1' });
      const btn = prepButton(prepOf(s, 'P1'));
      if (n > 0) expect(btn).toMatchObject({ kind: 'apply', enabled: false });
      expect(applyCommand(s, { type: 'CONFIRM_ALLOCATION', player: 'P1' }).error).toBeDefined();
    }
  });

  it('5. APPLY becomes active when the last die is placed', () => {
    const s = place(startBattle(), 'P1');
    expect(prepButton(prepOf(s, 'P1'))).toEqual({ kind: 'apply', label: 'APPLY', enabled: true });
  });

  it('6. APPLY -> READY locks the build', () => {
    const s = quickPrepare(startBattle(), 'P1');
    expect(prepButton(prepOf(s, 'P1'))).toMatchObject({ kind: 'ready', label: 'READY', enabled: false });
    for (const cmd of [
      { type: 'UNALLOCATE_DIE', slot: 0, player: 'P1' },
      { type: 'ALLOCATE_DIE', die: 0, slot: 1, player: 'P1' },
      { type: 'LOCK_DIE', die: 0, player: 'P1' },
      { type: 'REROLL', player: 'P1' },
      { type: 'FINISH_ROLLING', player: 'P1' },
      { type: 'CONFIRM_ALLOCATION', player: 'P1' }, // APPLY cannot be pressed twice
    ] as const) {
      const r = applyCommand(s, cmd);
      expect(r.error).toMatch(/READY/);
      expect(r.state).toBe(s);
    }
  });

  it('7. P1 READY does not affect P2', () => {
    const before = place(startBattle(), 'P2', 2);
    const after = quickPrepare(before, 'P1');
    expect(prepOf(after, 'P2')).toEqual(prepOf(before, 'P2'));
    expect(after.rng).toEqual(before.rng);
    expect(ok(after, { type: 'UNALLOCATE_DIE', slot: 0, player: 'P2' })).toBeDefined();
  });

  it('8. P2 READY does not affect P1', () => {
    const before = ok(startBattle(), { type: 'LOCK_DIE', die: 2, player: 'P1' });
    const after = quickPrepare(before, 'P2');
    expect(prepOf(after, 'P1')).toEqual(prepOf(before, 'P1'));
    expect(ok(after, { type: 'REROLL', player: 'P1' })).toBeDefined();
  });

  it('9. the countdown does not start when only one player is READY', () => {
    const { state, events } = run(startBattle(), [
      ...[0, 1, 2, 3, 4].map((i) => ({ type: 'ALLOCATE_DIE', die: i, slot: i, player: 'P1' }) as const),
      { type: 'CONFIRM_ALLOCATION', player: 'P1' },
    ]);
    expect(state.battle!.stage).toBe('dice');
    expect(state.battle!.countdown).toBe(0);
    expect(events.some((e) => e.type === 'COUNTDOWN_STARTED')).toBe(false);
    // The battle clock cannot be started early either.
    expect(applyCommand(state, { type: 'COMBAT_TICK', inputs: { attacker: idle, defender: idle } }).error).toBeDefined();
  });

  it('10. the countdown starts exactly when both are READY, then combat begins', () => {
    let s = quickPrepare(startBattle(), 'P2');
    const r = applyCommand(place(s, 'P1'), { type: 'CONFIRM_ALLOCATION', player: 'P1' });
    s = r.state;
    expect(r.events.filter((e) => e.type === 'COUNTDOWN_STARTED')).toEqual([{ type: 'COUNTDOWN_STARTED', ticks: s.ruleset.combat.countdownTicks }]);
    expect(s.battle!.stage).toBe('countdown');
    expect(s.battle!.builds).not.toBeNull();
    expect(s.battle!.combat).toBeNull();
    // Builds are frozen during the countdown.
    expect(applyCommand(s, { type: 'UNALLOCATE_DIE', slot: 0, player: 'P1' }).error).toBeDefined();
    // Exactly countdownTicks ticks later, combat starts.
    for (let i = 1; i < s.ruleset.combat.countdownTicks; i++) {
      s = ok(s, { type: 'COMBAT_TICK', inputs: { attacker: idle, defender: idle } });
      expect(s.battle!.stage).toBe('countdown');
    }
    s = ok(s, { type: 'COMBAT_TICK', inputs: { attacker: idle, defender: idle } });
    expect(s.battle!.stage).toBe('combat');
    expect(s.battle!.combat!.tick).toBe(0);
  });

  it('11. the countdown starts only once', () => {
    const { state, events } = run(startBattle(), [
      ...[0, 1, 2, 3, 4].map((i) => ({ type: 'ALLOCATE_DIE', die: i, slot: i, player: 'P1' }) as const),
      ...[0, 1, 2, 3, 4].map((i) => ({ type: 'ALLOCATE_DIE', die: i, slot: i, player: 'P2' }) as const),
      { type: 'CONFIRM_ALLOCATION', player: 'P1' },
      { type: 'CONFIRM_ALLOCATION', player: 'P2' },
    ]);
    expect(events.filter((e) => e.type === 'COUNTDOWN_STARTED')).toHaveLength(1);
    // Repeated APPLY presses after both are READY are rejected and change nothing.
    for (const p of ['P1', 'P2'] as const) {
      const r = applyCommand(state, { type: 'CONFIRM_ALLOCATION', player: p });
      expect(r.error).toBeDefined();
      expect(r.state).toBe(state);
    }
    let s = runCountdown(state);
    expect(s.battle!.stage).toBe('combat');
    s = fightToResult(s);
    expect(s.battle!.stage).toBe('result');
  });

  it('12. the next battle starts with a fresh preparation state', () => {
    let s = quickPrepare(quickPrepare(startBattle(), 'P1'), 'P2');
    s = ok(fightToResult(runCountdown(s)), { type: 'END_BATTLE' });
    expect(s.battle).toBeNull();
    // P2's second creature attacks the (wounded) winner on (5,2).
    s = ok(s, { type: 'MOVE_CREATURE', creatureId: 'P2-b-2', to: { x: 5, y: 2 } });
    const b = s.battle!;
    expect(b.stage).toBe('dice');
    expect(b.countdown).toBe(0);
    expect(b.builds).toBeNull();
    expect(b.combat).toBeNull();
    for (const p of ['P1', 'P2'] as const) {
      const prep = prepOf(s, p);
      expect(prep.stage).toBe('roll');
      expect(prep.rollsUsed).toBe(1);
      expect(prep.locked.every((l) => !l)).toBe(true);
      expect(prep.slotDice.every((d) => d === null)).toBe(true);
      expect(prepButton(prep).kind).toBe('reroll');
    }
  });

  it('only the two combatants are on the board during preparation, on their spawn cells', () => {
    const s = startBattle();
    const l = boardLayout(s.board);
    const units = boardUnits(s, l);
    expect(units.map((u) => u.creatureId).sort()).toEqual(['P1-a-1', 'P2-b-1']);
    const p1 = units.find((u) => u.owner === 'P1')!;
    expect({ x: p1.cx, y: p1.cy }).toEqual({ x: l.ox + l.cell / 2, y: l.oy + 4 * l.cell + l.cell / 2 });
    // The intro still shows the whole board.
    expect(boardUnits(s, l, false)).toHaveLength(4);
  });
});

const idle = { dx: 0, dy: 0, attack: false, block: false } as const;
