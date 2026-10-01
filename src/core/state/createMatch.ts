import { updatePowerPoints } from '../board/powerPoints';
import { createRng } from '../rng';
import { cellCode, cellInBoard, parseCell } from '../board/cells';
import type { BoardDef, CreatureDef, CreatureState, GameState, Placement, PowerupDef, Ruleset } from '../types';

export interface MatchSetup {
  ruleset: Ruleset;
  board: BoardDef;
  /** Validated creature definitions. The match keeps its own snapshot. */
  creatures: CreatureDef[];
  /** Validated Powerup definitions (referenced by creatures' powerupId). */
  powerups?: PowerupDef[];
  seed: number;
  playerNames?: { P1?: string; P2?: string };
}

const clone = <T>(v: T): T => structuredClone(v);

/** Builds the initial authoritative GameState. Throws on inconsistent setup. */
export function createMatch(setup: MatchSetup): GameState {
  const defs: Record<string, CreatureDef> = {};
  for (const def of setup.creatures) defs[def.id] = clone(def);

  const powerupDefs: Record<string, PowerupDef> = {};
  for (const p of setup.powerups ?? []) powerupDefs[p.id] = clone(p);

  // Lineup: the board's placements plus every creature with its own player + position.
  const lineup: Placement[] = [...setup.board.placements];
  for (const def of setup.creatures) {
    if (!def.player || !def.position) continue;
    const c = parseCell(def.position);
    if (!c || !cellInBoard(c, setup.board)) throw new Error(`Creature "${def.id}" has invalid position "${def.position}"`);
    lineup.push({ creature: def.id, owner: def.player, x: c.x, y: c.y });
  }

  const creatures: Record<string, CreatureState> = {};
  const counters: Record<string, number> = {};
  const taken = new Set<string>();
  for (const p of lineup) {
    const def = defs[p.creature];
    if (!def) throw new Error(`Board "${setup.board.id}" places unknown creature "${p.creature}"`);
    const cellKey = `${p.x},${p.y}`;
    if (taken.has(cellKey)) throw new Error(`Two creatures placed on ${cellCode(p)}`);
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
    powerupDefs,
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
