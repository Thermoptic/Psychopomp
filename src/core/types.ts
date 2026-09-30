// PSYCHOPOMP game core — shared types.
//
// Everything in src/core is pure TypeScript with no DOM, browser, Node or
// engine dependencies. The GameState below is the single authoritative source
// of truth; UI/renderer/audio only read it and send Commands.

// ---------------------------------------------------------------------------
// Basics
// ---------------------------------------------------------------------------

export type PlayerId = 'P1' | 'P2';
export const PLAYER_IDS: readonly PlayerId[] = ['P1', 'P2'];

export type MatchResult = 'ONGOING' | 'PLAYER_1' | 'PLAYER_2' | 'DRAW';

export interface Cell {
  x: number;
  y: number;
}

/** A dice stat category. Default categories are listed below; content may add more. */
export type StatCategory = string;
export const DEFAULT_CATEGORIES: readonly StatCategory[] = ['speed', 'power', 'shield', 'special', 'block'];

// ---------------------------------------------------------------------------
// Content (validated data, never mutated by the game)
// ---------------------------------------------------------------------------

/** Which dice a requirement looks at: one category's slots, or all final dice. */
export type DiceTarget = 'all' | StatCategory;

export type Requirement =
  | { type: 'always' | 'never' }
  | {
      type:
        | 'allOdd'
        | 'allEven'
        | 'anyOdd'
        | 'anyEven'
        | 'pair'
        | 'twoPair'
        | 'threeOfKind'
        | 'fourOfKind'
        | 'fullHouse'
        | 'allDifferent';
      target?: DiceTarget;
    }
  | { type: 'straight'; length?: number; target?: DiceTarget }
  | { type: 'sumAtLeast' | 'sumAtMost'; value: number; target?: DiceTarget }
  | { type: 'and' | 'or'; of: Requirement[] }
  | { type: 'not'; of: Requirement };

export type RequirementType = Requirement['type'];

export type Effect =
  | { type: 'addPower' | 'addShield' | 'addSpeed' | 'addBlock'; value: number }
  | { type: 'multi'; effects: Effect[] };

export type EffectType = Effect['type'];

export interface SpecialDef {
  name: string;
  description?: string;
  requirement: Requirement;
  effect: Effect;
}

export interface CreatureStats {
  maxHp: number;
  /** HP the creature starts the match with. Defaults to maxHp. */
  startHp?: number;
  /** Board movement allowance (steps per turn). */
  movement: number;
  power: number;
  speed: number;
  shield: number;
  /** Optional base block; block normally comes only from dice. */
  block?: number;
}

export interface CreatureDef {
  id: string;
  name: string;
  description?: string;
  faction?: string;
  tags?: string[];
  art: {
    portrait?: string;
    boardSprite?: string;
    combatSprite?: string;
    icon?: string;
  };
  stats: CreatureStats;
  dice: {
    /** Die sides for this creature. Defaults to the ruleset's dice.sides. */
    sides?: number;
    /** Number of dice slots per category. Sum must equal ruleset dice.count. */
    slots: Record<StatCategory, number>;
    /** Optional display order of categories. */
    order?: StatCategory[];
  };
  special: SpecialDef | null;
}

export interface CombatRules {
  tickRate: number;
  /**
   * Combat is fought on the strategic board itself. Positions are integer
   * combat units; one board cell is `cellUnits` units wide and high.
   */
  cellUnits: number;
  fighterRadius: number;
  /** Max centre-to-centre distance at which an attack connects. */
  attackRange: number;
  /** Ticks between pressing attack and the hit resolving. */
  windupTicks: number;
  baseCooldownTicks: number;
  cooldownPerSpeed: number;
  minCooldownTicks: number;
  baseMoveSpeed: number;
  /** Every N points of Speed add 1 arena unit per tick of movement. */
  speedPerMoveUnit: number;
  guardTicks: number;
  /** Guard charges = floor(block / blockChargeDivisor). */
  blockChargeDivisor: number;
  minDamage: number;
  /** 0 = no timeout. On timeout the attacker withdraws. */
  timeoutTicks: number;
}

export interface Ruleset {
  id: string;
  firstPlayer: PlayerId;
  dice: {
    count: number;
    sides: number;
    maxRerolls: number;
  };
  combat: CombatRules;
}

export interface Placement {
  creature: string;
  owner: PlayerId;
  x: number;
  y: number;
}

export interface BoardDef {
  id: string;
  name: string;
  width: number;
  height: number;
  allowDiagonal: boolean;
  passThroughCreatures: boolean;
  blockedCells: Cell[];
  powerPoints: Array<Cell & { owner?: PlayerId | null }>;
  placements: Placement[];
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

export interface CreatureState {
  id: string;
  defId: string;
  owner: PlayerId;
  /** Persistent HP. Carried between battles; never reset by the game. */
  hp: number;
  x: number;
  y: number;
  alive: boolean;
}

export interface PowerPointState extends Cell {
  owner: PlayerId | null;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
}

export interface RngState {
  seed: number;
  state: number;
}

export type BattleSide = 'attacker' | 'defender';
export const BATTLE_SIDES: readonly BattleSide[] = ['attacker', 'defender'];

export interface DiceSlot {
  category: StatCategory;
}

export type DicePrepStage = 'roll' | 'allocate' | 'done';

export interface DicePrep {
  creatureId: string;
  player: PlayerId;
  sides: number;
  /** Current die values; 0 = not rolled yet. */
  dice: number[];
  locked: boolean[];
  rollsUsed: number;
  maxRolls: number;
  stage: DicePrepStage;
  slots: DiceSlot[];
  /** slotDice[slotIndex] = index into `dice`, or null if the slot is empty. */
  slotDice: Array<number | null>;
}

export interface BattleStats {
  power: number;
  shield: number;
  speed: number;
  block: number;
}

export interface BattleBuild {
  creatureId: string;
  /** Sum of dice per category. */
  diceByCategory: Record<StatCategory, number>;
  specialName: string | null;
  specialActive: boolean;
  stats: BattleStats;
}

export interface Fighter {
  creatureId: string;
  side: BattleSide;
  x: number;
  y: number;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  stats: BattleStats;
  moveSpeed: number;
  attackCooldownTicks: number;
  cooldown: number;
  windup: number;
  guard: number;
  blockCharges: number;
}

export interface CombatState {
  tick: number;
  /** Playable area in combat units = board size × cellUnits. */
  arena: { width: number; height: number };
  fighters: Record<BattleSide, Fighter>;
}

export type BattleOutcome = 'ATTACKER_WINS' | 'DEFENDER_WINS' | 'DRAW' | 'TIMEOUT';

export interface BattleResult {
  outcome: BattleOutcome;
  attackerHp: number;
  defenderHp: number;
}

export type BattleStage = 'dice' | 'reveal' | 'combat' | 'result';

export interface BattleState {
  attackerId: string;
  defenderId: string;
  /** Where the attacker came from (it stays there until the battle resolves). */
  from: Cell;
  /** The contested cell (defender's position). */
  cell: Cell;
  stage: BattleStage;
  /** Which side is currently preparing dice (stage 'dice'). */
  preparing: BattleSide | null;
  prep: Record<BattleSide, DicePrep>;
  builds: Record<BattleSide, BattleBuild> | null;
  combat: CombatState | null;
  result: BattleResult | null;
}

export type GamePhase = 'board' | 'battle' | 'gameOver';

export interface GameState {
  version: 1;
  phase: GamePhase;
  ruleset: Ruleset;
  board: BoardDef;
  /** Snapshot of the content used by this match, keyed by def id. */
  creatureDefs: Record<string, CreatureDef>;
  players: Record<PlayerId, PlayerState>;
  creatures: Record<string, CreatureState>;
  powerPoints: PowerPointState[];
  currentTurn: { player: PlayerId; number: number };
  battle: BattleState | null;
  rng: RngState;
  matchResult: MatchResult;
  /** Why the match ended ('powerPoints' | 'elimination'), null while ongoing. */
  victoryReason: 'powerPoints' | 'elimination' | null;
}

// ---------------------------------------------------------------------------
// Commands and events
// ---------------------------------------------------------------------------

export interface FighterInput {
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
  /** Attack pressed this tick (edge, not held). */
  attack: boolean;
  /** Block pressed this tick (edge, not held). */
  block: boolean;
}

export const IDLE_INPUT: FighterInput = { dx: 0, dy: 0, attack: false, block: false };

/**
 * Every state change goes through one of these. `player`, where present, is
 * optional; when given, the core rejects the command if it is not that
 * player's decision to make.
 */
export type Command =
  | { type: 'MOVE_CREATURE'; creatureId: string; to: Cell; player?: PlayerId }
  | { type: 'PASS_TURN'; player?: PlayerId }
  | { type: 'ROLL_DICE'; player?: PlayerId }
  | { type: 'REROLL'; player?: PlayerId }
  | { type: 'LOCK_DIE'; die: number; player?: PlayerId }
  | { type: 'UNLOCK_DIE'; die: number; player?: PlayerId }
  | { type: 'FINISH_ROLLING'; player?: PlayerId }
  | { type: 'ALLOCATE_DIE'; die: number; slot: number; player?: PlayerId }
  | { type: 'UNALLOCATE_DIE'; slot: number; player?: PlayerId }
  | { type: 'CONFIRM_ALLOCATION'; player?: PlayerId }
  | { type: 'BEGIN_COMBAT' }
  | { type: 'COMBAT_TICK'; inputs: Record<BattleSide, FighterInput> }
  | { type: 'END_BATTLE' };

export type CommandType = Command['type'];

export type GameEvent =
  | { type: 'CREATURE_MOVED'; creatureId: string; from: Cell; to: Cell }
  | { type: 'BATTLE_STARTED'; attackerId: string; defenderId: string }
  | { type: 'DICE_ROLLED'; player: PlayerId; values: number[] }
  | { type: 'DIE_LOCK_CHANGED'; player: PlayerId; die: number; locked: boolean }
  | { type: 'DIE_ALLOCATED'; player: PlayerId; die: number; slot: number }
  | { type: 'ALLOCATION_CONFIRMED'; player: PlayerId }
  | { type: 'BUILDS_REVEALED' }
  | { type: 'SPECIAL_ACTIVATED'; creatureId: string; name: string }
  | { type: 'COMBAT_STARTED' }
  | { type: 'ATTACK_STARTED'; side: BattleSide }
  | { type: 'HIT'; side: BattleSide; damage: number }
  | { type: 'BLOCKED'; side: BattleSide }
  | { type: 'GUARD'; side: BattleSide }
  | { type: 'COMBAT_ENDED'; outcome: BattleOutcome }
  | { type: 'CREATURE_DIED'; creatureId: string }
  | { type: 'POWER_POINT_CAPTURED'; x: number; y: number; owner: PlayerId }
  | { type: 'TURN_STARTED'; player: PlayerId; number: number }
  | { type: 'MATCH_ENDED'; result: MatchResult };
