import { describe, expect, it } from 'vitest';
import { applyCommand, inAttackRange, type CreatureDef, type FighterInput, type GameEvent, type GameState } from '../src/core';
import { resolveDash } from '../src/core/combat/simulation';
import { validateCreature } from '../src/content/validate';
import { emptyFrame, type Action, type ActionFrame } from '../src/input/actions';
import { DEFAULT_BINDINGS } from '../src/input/bindings';
import { aimToward, emptyQueue, queuePresses, toFighterInput } from '../src/input/combatInput';
import { radialDeadzone, readPad, type PadLike } from '../src/input/gamepad';
import { aimReticle } from '../src/rendering/boardUnits';
import { basePack, customMatch, ok, prepareBothAndBegin, testCreature, type TestStats } from './helpers';

// --- fixtures ----------------------------------------------------------------

const DICE1 = { sides: 1, slots: { speed: 1, power: 1, shield: 1, dash: 1, block: 1 } };
// Dash modifier 5 + the DASH die (always 1 here) = 6 -> 1 s dash cooldown.
const mk = (id: string, stats: TestStats = {}, extra: Partial<CreatureDef> = {}) =>
  testCreature(id, { dash: 5, ...stats }, { dice: DICE1, ...extra });

/** A battle in progress: P1-a-1 (attacker, left) vs P2-b-1 (defender, right). */
function fight(a: CreatureDef = mk('a'), b: CreatureDef = mk('b')): GameState {
  const s = customMatch({
    width: 9,
    height: 9,
    creatures: [{ ...a, id: 'a' }, { ...b, id: 'b' }],
    placements: [
      { creature: 'a', owner: 'P1', x: 3, y: 2 },
      { creature: 'b', owner: 'P2', x: 5, y: 2 },
      { creature: 'b', owner: 'P2', x: 8, y: 8 },
    ],
  });
  return prepareBothAndBegin(ok(s, { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 5, y: 2 } }));
}

const idle: FighterInput = { dx: 0, dy: 0, attack: false, block: false };
const F = (s: GameState) => s.battle!.combat!.fighters;

function step(s: GameState, attacker: Partial<FighterInput> = {}, defender: Partial<FighterInput> = {}) {
  const r = applyCommand(s, { type: 'COMBAT_TICK', inputs: { attacker: { ...idle, ...attacker }, defender: { ...idle, ...defender } } });
  if (r.error) throw new Error(r.error);
  return { s: r.state, events: r.events };
}
function run(s: GameState, n: number, attacker: Partial<FighterInput> = {}, defender: Partial<FighterInput> = {}) {
  const events: GameEvent[] = [];
  for (let i = 0; i < n; i++) {
    const r = step(s, attacker, defender);
    s = r.s;
    events.push(...r.events);
  }
  return { s, events };
}

/** A fake standard-mapping gamepad. */
function pad(axes: number[] = [0, 0, 0, 0], buttons: Record<number, number> = {}): PadLike {
  return {
    connected: true,
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: (buttons[i] ?? 0) >= 0.5, value: buttons[i] ?? 0 })),
  };
}

/** One frame for a player holding this pad; `pressed` = buttons that went down this frame. */
function padFrame(p: PadLike, pressed: Action[] = []): ActionFrame {
  const r = readPad(p, DEFAULT_BINDINGS);
  return { ...emptyFrame(), held: r.held, pressed: new Set(pressed.filter((a) => r.held.has(a))), axes: r.axes, hasGamepad: true };
}
function inputFrom(p: PadLike, pressed: Action[] = []): FighterInput {
  const f = padFrame(p, pressed);
  const q = emptyQueue();
  queuePresses(q, f);
  return toFighterInput(f, q, null);
}

/** Walks P1 to the right until the fighters are in attack range. */
function closeIn(s: GameState): GameState {
  while (!inAttackRange(F(s).attacker, F(s).defender, s.ruleset.combat)) s = step(s, { dx: 100 }).s;
  return s;
}

// --- tests -----------------------------------------------------------------------

describe('twin-stick: movement (left stick)', () => {
  it('1. P1 moves with the left stick', () => {
    let s = fight();
    const start = { ...F(s).attacker };
    const input = inputFrom(pad([0.9, 0, 0, 0]));
    expect(input.dx).toBeGreaterThan(80);
    s = run(s, 10, input).s;
    expect(F(s).attacker.x).toBeGreaterThan(start.x);
    expect(F(s).attacker.y).toBe(start.y);
  });

  it('2. P2 moves with its own left stick', () => {
    let s = fight();
    const start = { ...F(s).defender };
    s = run(s, 10, {}, inputFrom(pad([-1, 0.6, 0, 0]))).s;
    expect(F(s).defender.x).toBeLessThan(start.x);
    expect(F(s).defender.y).toBeGreaterThan(start.y);
    expect(F(s).attacker.x).toBe(fight().battle!.combat!.fighters.attacker.x); // P1 untouched
  });

  it('analog magnitude scales speed; deadzone removes jitter', () => {
    const half = run(fight(), 10, { dx: 50 }).s;
    const full = run(fight(), 10, { dx: 100 }).s;
    expect(F(half).attacker.x - 40).toBeLessThan(F(full).attacker.x - 40);
    expect(radialDeadzone(0.1, -0.12, 0.2)).toEqual({ x: 0, y: 0 });
    expect(inputFrom(pad([0.15, 0.1, 0.1, -0.1]))).toMatchObject({ dx: 0, dy: 0, aimX: 0, aimY: 0 });
  });
});

describe('twin-stick: aim (right stick)', () => {
  it('3. P1 aims with the right stick', () => {
    const s = step(fight(), inputFrom(pad([0, 0, 0, -1]))).s;
    expect(F(s).attacker.aim).toEqual({ x: 0, y: -100 });
  });

  it('4. P2 aims with its right stick', () => {
    const s = step(fight(), {}, inputFrom(pad([0, 0, 1, 0]))).s;
    expect(F(s).defender.aim).toEqual({ x: 100, y: 0 });
  });

  it('5. P1 and P2 aim at the same time without sharing state', () => {
    const s = step(fight(), inputFrom(pad([0, 0, 0, 1])), inputFrom(pad([0, 0, -1, -1]))).s;
    expect(F(s).attacker.aim).toEqual({ x: 0, y: 100 });
    expect(F(s).defender.aim.x).toBeLessThan(0);
    expect(F(s).defender.aim.y).toBeLessThan(0);
  });

  it('6. aim is separate from movement and kept when the stick is released', () => {
    let s = fight();
    const y0 = F(s).attacker.y;
    s = run(s, 5, inputFrom(pad([1, 0, 0, -1]))).s; // move right, aim up
    expect(F(s).attacker.aim).toEqual({ x: 0, y: -100 });
    expect(F(s).attacker.y).toBe(y0);
    s = run(s, 5, inputFrom(pad([1, 0, 0, 0]))).s; // aim released
    expect(F(s).attacker.aim).toEqual({ x: 0, y: -100 });
  });
});

describe('twin-stick: attack (Right Trigger)', () => {
  it('7. RT attacks in the aim direction', () => {
    expect(readPad(pad([0, 0, 0, 0], { 7: 1 }), DEFAULT_BINDINGS).held.has('attack')).toBe(true);
    let s = closeIn(fight(mk('a', { power: 10 }), mk('b', { shield: 0 })));
    const hp = F(s).defender.hp;
    // Aim straight up (away from the target on the right): the swing misses.
    let r = run(s, 1, inputFrom(pad([0, 0, 0, -1], { 7: 1 }), ['attack']));
    expect(r.events.some((e) => e.type === 'ATTACK_STARTED')).toBe(true);
    r = run(r.s, s.ruleset.combat.windupTicks + 1);
    expect(F(r.s).defender.hp).toBe(hp);
    // Wait for the cooldown, aim right at the target: it hits.
    s = run(r.s, 80).s;
    r = run(s, 1, inputFrom(pad([0, 0, 1, 0], { 7: 1 }), ['attack']));
    r = run(r.s, s.ruleset.combat.windupTicks + 1);
    expect(F(r.s).defender.hp).toBeLessThan(hp);
  });

  it('8. holding RT repeats only for autoFire attacks', () => {
    const held = { attack: false, attackHeld: true };
    const normal = run(closeIn(fight()), 300, held);
    expect(normal.events.filter((e) => e.type === 'ATTACK_STARTED' && e.side === 'attacker')).toHaveLength(0);
    const rapid = run(closeIn(fight(mk('a', { maxHp: 999 }, { attack: { autoFire: true } }), mk('b', { maxHp: 999 }))), 300, held);
    expect(rapid.events.filter((e) => e.type === 'ATTACK_STARTED' && e.side === 'attacker').length).toBeGreaterThan(3);
  });
});

describe('twin-stick: dash (Right Bumper)', () => {
  it('9. RB triggers a dash', () => {
    const held = readPad(pad([1, 0, 0, 0], { 5: 1 }), DEFAULT_BINDINGS).held;
    expect(held.has('dash')).toBe(true);
    const s0 = fight();
    const r = step(s0, inputFrom(pad([1, 0, 0, 0], { 5: 1 }), ['dash']));
    expect(r.events).toContainEqual({ type: 'DASH', side: 'attacker' });
    const after = run(r.s, 10).s;
    const walked = run(s0, 11, { dx: 100 }).s;
    expect(F(after).attacker.x).toBeGreaterThan(F(walked).attacker.x); // much faster than walking
  });

  it('10. dash goes along the left stick, not the aim', () => {
    const s = run(fight(), 12, inputFrom(pad([1, 0, 0, -1], { 5: 1 }), ['dash'])).s;
    const s0 = fight();
    expect(F(s).attacker.x).toBeGreaterThan(F(s0).attacker.x + 150);
    expect(F(s).attacker.y).toBe(F(s0).attacker.y);
  });

  it('11. dash works diagonally (full analog direction)', () => {
    const s0 = fight();
    const s = run(s0, 1, { dx: -100, dy: -100, dash: true }, {}).s;
    const end = run(s, 10).s;
    const dx = F(s0).attacker.x - F(end).attacker.x;
    const dy = F(s0).attacker.y - F(end).attacker.y;
    // P1 starts at the left edge, so x is clamped; use P2 for the free diagonal.
    const p2 = run(run(s0, 1, {}, { dx: -100, dy: 100, dash: true }).s, 10).s;
    const pdx = F(s0).defender.x - F(p2).defender.x;
    const pdy = F(p2).defender.y - F(s0).defender.y;
    expect(pdx).toBeGreaterThan(100);
    expect(Math.abs(pdx - pdy)).toBeLessThanOrEqual(2);
    expect(dy).toBeGreaterThan(100);
    expect(dx).toBeGreaterThanOrEqual(0);
  });

  it('12. no dash (and no cooldown) without a movement direction', () => {
    const r = step(fight(), inputFrom(pad([0.1, 0.05, 1, 0], { 5: 1 }), ['dash']));
    expect(r.events.some((e) => e.type === 'DASH')).toBe(false);
    expect(F(r.s).attacker.dashCooldown).toBe(0);
    expect(F(r.s).attacker.dashTicks).toBe(0);
  });

  it('13. dash cooldown = 7 s - DASH die - modifier (die 1, modifier 0 -> 6 s), enforced to the tick', () => {
    const s0 = fight(mk('a', { dash: 0 }));
    const rules = s0.ruleset.combat;
    expect(rules.dash.baseCooldown).toBe(7);
    expect(F(s0).attacker.dashCooldownTicks).toBe(6 * rules.tickRate);
    let s = step(s0, { dx: 0, dy: -100, dash: true }).s;
    expect(F(s).attacker.dashCooldown).toBe(6 * rules.tickRate);
    s = run(s, 6 * rules.tickRate - 2, {}).s;
    let r = step(s, { dx: 0, dy: 100, dash: true }); // 6 s minus one tick: still cooling down
    expect(r.events.some((e) => e.type === 'DASH')).toBe(false);
    r = step(r.s, { dx: 0, dy: 100, dash: true }); // exactly 6 s later
    expect(r.events).toContainEqual({ type: 'DASH', side: 'attacker' });
  });

  it('14 + 15. dash cooldown is per player; P1 dashing does not affect P2', () => {
    let r = step(fight(), { dx: 100, dash: true });
    expect(F(r.s).attacker.dashCooldown).toBeGreaterThan(0);
    expect(F(r.s).defender.dashCooldown).toBe(0);
    r = step(r.s, {}, { dx: -100, dash: true });
    expect(r.events).toContainEqual({ type: 'DASH', side: 'defender' });
    expect(F(r.s).defender.dashCooldown).toBe(F(r.s).defender.dashCooldownTicks);
  });

  it('dash settings come from creature data (prepared for the Monster Editor)', () => {
    const rules = basePack().ruleset.combat;
    const fast = mk('fast', {}, { dash: { distance: 5, damage: 3, dealsDamage: true } });
    expect(resolveDash(fast, rules, 6)).toMatchObject({ cooldownTicks: 1 * rules.tickRate, damage: 3, dealsDamage: true, distance: 5 });
    expect(resolveDash(mk('plain'), rules, 6)).toMatchObject({ cooldownTicks: 1 * rules.tickRate, dealsDamage: false, distance: 3 });
    expect(validateCreature(fast, basePack().ruleset).ok).toBe(true);
    // A per-creature cooldown no longer exists (it comes from the DASH value).
    expect(validateCreature(mk('bad', {}, { dash: { cooldown: 2 } as never }), basePack().ruleset).ok).toBe(false);
    // A damaging dash into the opponent deals its damage once.
    let s = fight(fast, mk('b', { maxHp: 50 }));
    while (F(s).defender.x - F(s).attacker.x > 200) s = step(s, { dx: 100 }).s;
    const hp = F(s).defender.hp;
    const r = run(s, 12, { dx: 100, dash: true });
    expect(r.events.filter((e) => e.type === 'DASH_HIT')).toHaveLength(1);
    expect(F(r.s).defender.hp).toBe(hp - 3);
  });

  it('20. dash is not affected by the aim direction', () => {
    const up = run(fight(), 12, { dx: 100, dash: true, aimX: 0, aimY: -100 }).s;
    const down = run(fight(), 12, { dx: 100, dash: true, aimX: -100, aimY: 100 }).s;
    expect({ x: F(up).attacker.x, y: F(up).attacker.y }).toEqual({ x: F(down).attacker.x, y: F(down).attacker.y });
  });
});

describe('twin-stick: Special (Left Trigger) and Left Bumper', () => {
  const manual = mk('m', {}, { special: { name: 'Rage', requirement: { type: 'always' }, effect: { type: 'addPower', value: 10 }, activation: 'manual' } });

  it('16. LT triggers a manual Special once', () => {
    expect(readPad(pad([0, 0, 0, 0], { 6: 1 }), DEFAULT_BINDINGS).held.has('special')).toBe(true);
    let s = fight(manual);
    const power = F(s).attacker.stats.power;
    expect(F(s).attacker.special).toBe('ready');
    const r = step(s, inputFrom(pad([0, 0, 0, 0], { 6: 1 }), ['special']));
    expect(r.events).toContainEqual({ type: 'SPECIAL_TRIGGERED', side: 'attacker', name: 'Rage' });
    expect(F(r.s).attacker.stats.power).toBe(power + 10);
    expect(F(r.s).attacker.special).toBe('used');
    s = step(r.s, { special: true }).s;
    expect(F(s).attacker.stats.power).toBe(power + 10); // only once
  });

  it('auto Specials keep their existing behaviour (LT does nothing extra)', () => {
    const auto = mk('m', {}, { special: { name: 'Odd', requirement: { type: 'always' }, effect: { type: 'addPower', value: 10 } } });
    const s = fight(auto);
    expect(F(s).attacker.special).toBe('passive');
    const r = step(s, { special: true });
    expect(F(r.s).attacker.stats.power).toBe(F(s).attacker.stats.power);
    expect(r.events.some((e) => e.type === 'SPECIAL_TRIGGERED')).toBe(false);
  });

  it('17. Left Bumper does nothing in combat', () => {
    const lb = pad([0, 0, 0, 0], { 4: 1 });
    expect([...readPad(lb, DEFAULT_BINDINGS).held]).toEqual(['previous']); // board-cursor only
    const input = inputFrom(lb, ['previous']);
    expect(input).toEqual({ dx: 0, dy: 0, aimX: 0, aimY: 0, attack: false, attackHeld: false, block: false, dash: false, special: false, specialHeld: false });
    const s0 = fight(manual);
    expect(step(s0, input).s).toEqual(step(s0, idle).s);
  });
});

describe('twin-stick: aim reticle', () => {
  const l = { ox: 0, oy: 0, cell: 40 };
  const u = { cx: 100, cy: 100 };

  it('18. the reticle follows the aim direction', () => {
    const s = fight();
    const f = { ...F(s).attacker };
    expect(aimReticle(u, { ...f, aim: { x: 100, y: 0 } }, l)).toEqual({ x: 132, y: 100 });
    expect(aimReticle(u, { ...f, aim: { x: 0, y: -100 } }, l)).toEqual({ x: 100, y: 68 });
    const diag = aimReticle(u, { ...f, aim: { x: -100, y: 100 } }, l);
    expect(diag.x).toBeLessThan(100);
    expect(diag.y).toBeGreaterThan(100);
  });

  it('19. aiming (and the reticle) never changes movement', () => {
    const a = run(fight(), 30, { dx: 70, dy: 40, aimX: 0, aimY: -100 }).s;
    const b = run(fight(), 30, { dx: 70, dy: 40, aimX: -100, aimY: 30 }).s;
    expect({ x: F(a).attacker.x, y: F(a).attacker.y }).toEqual({ x: F(b).attacker.x, y: F(b).attacker.y });
  });
});

describe('keyboard fallback and existing rules', () => {
  it('21. keyboard players move digitally and auto-aim at the opponent', () => {
    const f = { ...emptyFrame(), held: new Set<Action>(['move_right', 'confirm']), pressed: new Set<Action>(['confirm']) };
    const q = emptyQueue();
    queuePresses(q, f);
    const input = toFighterInput(f, q, aimToward({ x: 0, y: 0 }, { x: 50, y: -50 }));
    expect(input).toMatchObject({ dx: 100, dy: 0, aimX: 100, aimY: -100, attack: true });
  });
});

describe('dash regression: "RB freezes and flashes but does not dash"', () => {
  /** P1 walked back against the left wall. */
  const atLeftWall = () => run(fight(), 30, { dx: -100 }).s;

  it('stick drift just outside the deadzone does not trigger a dash (no cooldown spent)', () => {
    // The bug: RB with the stick "at rest" drifting to (-0.23, 0.05) dashed in direction (-4, 1).
    const s0 = atLeftWall();
    const input = inputFrom(pad([-0.23, 0.05, 0, 0], { 5: 1 }), ['dash']);
    expect(input.dx).not.toBe(0); // drift does reach movement...
    const r = step(s0, input);
    expect(r.events.some((e) => e.type === 'DASH')).toBe(false); // ...but never a dash
    expect(r.events).toContainEqual({ type: 'DASH_DENIED', side: 'attacker', reason: 'noDirection' });
    expect(F(r.s).attacker.dashCooldown).toBe(0);
    expect(F(r.s).attacker.dashTicks).toBe(0);
  });

  it('a dash straight into a wall does not start, freeze or cost the cooldown', () => {
    const s0 = atLeftWall();
    const r = step(s0, { dx: -100, dash: true });
    expect(r.events).toContainEqual({ type: 'DASH_DENIED', side: 'attacker', reason: 'blocked' });
    expect(F(r.s).attacker.dashTicks).toBe(0);
    expect(F(r.s).attacker.dashCooldown).toBe(0);
    // ...and a real dash away from the wall works right after.
    const ok2 = run(r.s, 9, { dx: 100, dash: true });
    expect(ok2.events.filter((e) => e.type === 'DASH')).toHaveLength(1);
    expect(F(ok2.s).attacker.x).toBeGreaterThan(F(s0).attacker.x + 200);
  });

  it('a dash that reaches a wall stops there instead of standing still', () => {
    // P1 one cell from the top wall dashes up: it should end early, not run all ticks in place.
    let s = run(fight(), 200, { dy: -100 }).s; // walk all the way to the top wall
    while (F(s).attacker.y < s.ruleset.combat.fighterRadius + 40) s = step(s, { dy: 100 }).s; // ~half a cell of room
    s = step(s, { dy: -100, dash: true }).s;
    const startTicks = F(s).attacker.dashTicks;
    expect(startTicks).toBeGreaterThan(0);
    s = run(s, 3).s;
    expect(F(s).attacker.dashTicks).toBe(0);
    expect(F(s).attacker.y).toBe(s.ruleset.combat.fighterRadius);
  });

  it('a deliberate stick push still dashes in every direction', () => {
    for (const [dx, dy] of [[100, 0], [0, 100], [0, -100], [70, -70], [40, 0]] as const) {
      const r = step(fight(), { dx, dy, dash: true });
      expect(r.events).toContainEqual({ type: 'DASH', side: 'attacker' });
    }
    expect(step(fight(), { dx: 30, dy: 0, dash: true }).events.some((e) => e.type === 'DASH')).toBe(false);
  });

  it('a dash during cooldown reports why it was refused', () => {
    let s = step(fight(), { dx: 100, dash: true }).s;
    s = run(s, 10).s;
    const r = step(s, { dx: 100, dash: true });
    expect(r.events).toContainEqual({ type: 'DASH_DENIED', side: 'attacker', reason: 'cooldown' });
  });
});
