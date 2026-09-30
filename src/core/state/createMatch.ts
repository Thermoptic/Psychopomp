import { updatePowerPoints } from '../board/powerPoints';
import { createRng } from '../rng';
import type { BoardDef, CreatureDef, CreatureState, GameState, Ruleset } from '../types';

export interface MatchSetup {
  ruleset: Ruleset;
  board: BoardDef;
  /** Validated creature definitions. The match keeps its own snapshot. */
  creatures: CreatureDef[];
  seed: number;
  playerNames?: { P1?: string; P2?: string };
}

const clone = <T>(v: T): T => structuredClone(v);

/** Builds the initial authoritative GameState. Throws on inconsistent setup. */
export function createMatch(setup: MatchSetup): GameState {
  const defs: Record<string, CreatureDef> = {};
  for (const def of setup.creatures) defs[def.id] = clone(def);

  const creatures: Record<string, CreatureState> = {};
  const counters: Record<string, number> = {};
  const taken = new Set<string>();
  for (const p of setup.board.placements) {
    const def = defs[p.creature];
    if (!def) throw new Error(`Board "${setup.board.id}" places unknown creature "${p.creature}"`);
    const cellKey = `${p.x},${p.y}`;
    if (taken.has(cellKey)) throw new Error(`Two creatures placed on ${cellKey}`);
    taken.add(cellKey);
    const n = (counters[`${p.owner}-${p.creature}`] ?? 0) + 1;
    counters[`${p.owner}-${p.creature}`] = n;
    const id = `${p.owner}-${p.creature}-${n}`;
    creatures[id] = {
      id,
      defId: def.id,
      owner: p.owner,
      hp: def.stats.startHp ?? def.stats.maxHp,
      x: p.x,
      y: p.y,
      alive: true,
    };
  }

  const state: GameState = {
    version: 1,
    phase: 'board',
    ruleset: clone(setup.ruleset),
    board: clone(setup.board),
    creatureDefs: defs,
    players: {
      P1: { id: 'P1', name: setup.playerNames?.P1 ?? 'PLAYER 1' },
      P2: { id: 'P2', name: setup.playerNames?.P2 ?? 'PLAYER 2' },
    },
    creatures,
    powerPoints: setup.board.powerPoints.map((p) => ({ x: p.x, y: p.y, owner: p.owner ?? null })),
    currentTurn: { player: setup.ruleset.firstPlayer, number: 1 },
    battle: null,
    rng: createRng(setup.seed),
    matchResult: 'ONGOING',
    victoryReason: null,
  };
  // Creatures that start on a Power Point claim it.
  updatePowerPoints(state, []);
  return state;
}
