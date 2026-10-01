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
/** Default dice slots. A die on DASH sets how far the creature dashes (formerly the SPECIAL slot). */
export const DEFAULT_CATEGORIES: readonly StatCategory[] = ['speed', 'power', 'shield', 'dash', 'block'];

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
  | { type: 'not'; of: Requirement }
  /**
   * Per-slot conditions: entry i applies to the die placed in the creature's
   * i-th dice slot (layout order). null = slot not used (no requirement).
   * All non-null entries must hold; with no active entries it never holds.
   */
  | { type: 'slots'; slots: Array<SlotCondition | null> };

/** One dice-slot condition: 'odd' (1,3,5), 'even' (2,4,6) or an exact face. */
export type SlotCondition = 'odd' | 'even' | number;

export type RequirementType = Requirement['type'];

export type Effect =
  | { type: 'addPower' | 'addShield' | 'addSpeed' | 'addBlock' | 'addDash'; value: number }
  | { type: 'multi'; effects: Effect[] };

export type EffectType = Effect['type'];

export interface SpecialDef {
  name: string;
  description?: string;
  requirement: Requirement;
  effect: Effect;
  /**
   * 'auto' (default): the effect applies for the whole battle as soon as the
   * dice requirement is met. 'manual': the requirement only unlocks it; the
   * player triggers it once per battle with the SPECIAL input (Left Trigger).
   */
  activation?: 'auto' | 'manual';
}

/** Melee weapon settings (designer levels 1-10, see core/combat/powerups.ts). */
export interface MeleeSettings {
  speed: number;
  knockback: number;
  range: number;
}

/** Ranged weapon settings (levels 1-10; impactDamage 1-100, see core/combat/powerups.ts). */
export interface RangedSettings {
  speed: number;
  range: number;
  rateOfFire: number;
  impactSize: number;
  impactDamage: number;
  homing: number;
  trajectory: number;
  bounce: number;
}

/**
 * A weapon: melee or ranged plus its settings. Used by a monster's own attack
 * and by Powerups. Both settings blocks may be kept; `type` picks the active one.
 */
export interface WeaponSettings {
  type?: 'melee' | 'ranged';
  melee?: MeleeSettings;
  ranged?: RangedSettings;
}

/**
 * The monster's own attack. Without `type` it is the classic melee (cooldown
 * from the Speed stat, ruleset reach, no knockback). A Powerup, when equipped,
 * replaces it.
 */
export interface AttackDef extends WeaponSettings {
  /** true: holding the attack input keeps attacking whenever the cooldown allows. */
  autoFire?: boolean;
}

/** Per-creature dash options. Missing fields fall back to ruleset combat.dash. */
export interface DashDef {
  /** Base distance in arena cells, added to the dash points' distance. */
  distance?: number;
  /** Cooldown in seconds. */
  cooldown?: number;
  /** Damage dealt when the dash runs into the opponent (only if dealsDamage). */
  damage?: number;
  dealsDamage?: boolean;
}

export interface CreatureStats {
  /** Starting (and maximum) health. */
  maxHp: number;
  /** HP the creature starts the match with. Defaults to maxHp. */
  startHp?: number;
  /** Board movement allowance (steps per turn). */
  movement: number;
}

/**
 * Per-creature start bonus/penalty on top of the ruleset's `creatureBase`
 * (all default 0). Battle stats = creatureBase + modifiers + dice + Special.
 * `dash` adds dash points (dash distance, see resolveDash).
 */
export interface CreatureModifiers {
  power?: number;
  speed?: number;
  shield?: number;
  block?: number;
  dash?: number;
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
  modifiers?: CreatureModifiers;
  /**
   * Optional start placement: the creature joins the match lineup for this
   * player on this board cell (cell code "A1".."I9", see core/board/cells).
   */
  player?: PlayerId;
  position?: string;
  /** Weapon/attack from the Powerups content (by id). None = classic melee. */
  powerupId?: string | null;
  dice: {
    /** Die sides for this creature. Defaults to the ruleset's dice.sides. */
    sides?: number;
    /** Number of dice slots per category. Sum must equal ruleset dice.count. */
    slots: Record<StatCategory, number>;
    /** Optional display order of categories. */
    order?: StatCategory[];
  };
  special: SpecialDef | null;
  attack?: AttackDef;
  dash?: DashDef;
}

/**
 * A Powerup (weapon) definition. Values are designer levels (1-10, impact
 * damage 1-100); core/combat/powerups.ts maps them to gameplay values.
 */
export interface PowerupDef extends WeaponSettings {
  id: string;
  name: string;
  type: 'melee' | 'ranged';
}

export interface CombatRules {
  tickRate: number;
  /**
   * Combat is fought on its own grid arena (wider than the strategic board),
   * `arenaColumns` × `arenaRows` cells. Positions are integer combat units;
   * one cell is `cellUnits` units wide and high. These are gameplay data, so
   * they never depend on the screen size.
   */
  cellUnits: number;
  arenaColumns: number;
  arenaRows: number;
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
  /** Ticks of the 3-2-1 countdown between "both READY" and combat (0 = start at once). */
  countdownTicks: number;
  /**
   * Attacks hit only targets inside a cone around the aim direction:
   * cos(half-angle) in percent (50 = ±60°, -100 = all around).
   */
  attackConeCos: number;
  /** Default dash for creatures without their own `dash` data. */
  dash: Required<DashDef> & {
    /** Cells of dash distance per dash point (the DASH die + dash modifier). */
    distancePerPoint: number;
    /** How many ticks a dash lasts (the distance is covered over these ticks). */
    durationTicks: number;
    /**
     * Minimum movement-stick deflection (percent) for a dash, so stick drift or
     * noise just outside the deadzone never triggers one.
     */
    minInput: number;
  };
}

export interface Ruleset {
  id: string;
  firstPlayer: PlayerId;
  /** Battle stats every creature starts from before its modifiers. */
  creatureBase: { power: number; speed: number; shield: number; block: number; dash: number };
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
  /** Dash points: dash distance = ruleset dash.distance + dash × dash.distancePerPoint cells. */
  dash: number;
}

export interface BattleBuild {
  creatureId: string;
  /** Sum of dice per category. */
  diceByCategory: Record<StatCategory, number>;
  specialName: string | null;
  /** Requirement met (for 'manual' specials: unlocked, not yet applied). */
  specialActive: boolean;
  /** 'manual' specials are applied in combat with the SPECIAL input. */
  specialManual: boolean;
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
  /** Current aim direction (integer vector, never 0,0). Kept when the aim input is released. */
  aim: { x: number; y: number };
  /** Aim captured when the current swing started; the swing resolves in this direction. */
  swingAim: { x: number; y: number };
  autoFire: boolean;
  /** Dash: remaining dash ticks, direction, per-tick step, cooldown. */
  dashTicks: number;
  dashDir: { x: number; y: number };
  dashStep: number;
  dashCooldown: number;
  dashCooldownTicks: number;
  dashDamage: number;
  dashDealsDamage: boolean;
  /** The current dash already dealt its damage. */
  dashHit: boolean;
  /** 'none' | 'passive' (auto, already applied) | 'ready' (manual, unlocked) | 'used'. */
  special: 'none' | 'passive' | 'ready' | 'used';
  /** The fighter's attack, resolved from its Powerup (or the classic melee). */
  weapon: Weapon;
}

/** Gameplay values of an attack (combat units / ticks), see core/combat/powerups.ts. */
export type Weapon =
  | {
      kind: 'melee';
      /** The Powerup providing this weapon; null = the monster's own attack. */
      powerupId: string | null;
      /** null = classic melee: cooldown from the Speed stat. */
      cooldownTicks: number | null;
      range: number;
      knockback: number;
    }
  | {
      kind: 'ranged';
      powerupId: string | null;
      cooldownTicks: number;
      /** Projectile speed, combat units per tick. */
      speed: number;
      /** Max travel distance before it fizzles, combat units. */
      range: number;
      impactRadius: number;
      impactDamage: number;
      /** Steering towards the opponent per tick, percent of speed. */
      homing: number;
      /** Magnus curve per tick at full sideways movement, angle × 65536 (radians). */
      curve: number;
      bounces: number;
    };

/** A projectile in flight. Positions/velocity in combat units × 256 (fixed point). */
export interface Projectile {
  id: number;
  side: BattleSide;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Speed (fixed point) the velocity is kept at. */
  speed: number;
  travelled: number;
  maxTravel: number;
  bouncesLeft: number;
  homing: number;
  /** Curve rotation per tick as fixed-point cos/sin (×65536); sin 0 = straight. */
  curveCos: number;
  curveSin: number;
  impactRadius: number;
  impactDamage: number;
}

export interface CombatState {
  tick: number;
  /** Playable area in combat units = arena grid × cellUnits. */
  arena: { width: number; height: number };
  fighters: Record<BattleSide, Fighter>;
  projectiles: Projectile[];
  nextProjectileId: number;
}

export type BattleOutcome = 'ATTACKER_WINS' | 'DEFENDER_WINS' | 'DRAW' | 'TIMEOUT';

export interface BattleResult {
  outcome: BattleOutcome;
  attackerHp: number;
  defenderHp: number;
}

/**
 * dice:      both players prepare at the same time (each DicePrep has its own
 *            roll -> allocate -> done stage; done = READY)
 * countdown: entered exactly once, when the second player becomes READY
 * combat:    real-time fight
 * result:    fight over, waiting for END_BATTLE
 */
export type BattleStage = 'dice' | 'countdown' | 'combat' | 'result';

export interface BattleState {
  attackerId: string;
  defenderId: string;
  /** Where the attacker came from (it stays there until the battle resolves). */
  from: Cell;
  /** The contested cell (defender's position). */
  cell: Cell;
  stage: BattleStage;
  prep: Record<BattleSide, DicePrep>;
  builds: Record<BattleSide, BattleBuild> | null;
  /** Countdown ticks remaining (stage 'countdown'). */
  countdown: number;
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
  /** Snapshot of the Powerups used by this match, keyed by id. */
  powerupDefs: Record<string, PowerupDef>;
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

/**
 * One player's combat input for one tick. Analog values are integers in
 * -100..100 (percent of full stick deflection) so the simulation stays
 * deterministic; the platform layer applies deadzones before quantising.
 */
export interface FighterInput {
  /** Movement (left stick / movement keys). Also the dash direction. */
  dx: number;
  dy: number;
  /** Aim (right stick). 0,0 = no aim input: the last aim direction is kept. */
  aimX?: number;
  aimY?: number;
  /** Attack pressed this tick (edge). */
  attack: boolean;
  /** Attack held (Right Trigger held); only used by autoFire attacks. */
  attackHeld?: boolean;
  /** Block pressed this tick (edge). */
  block: boolean;
  /** Dash pressed this tick (edge, Right Bumper). */
  dash?: boolean;
  /** Special pressed this tick (edge, Left Trigger). */
  special?: boolean;
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
  // Dice preparation runs for both players at once, so these must name the player.
  | { type: 'ROLL_DICE'; player: PlayerId }
  | { type: 'REROLL'; player: PlayerId }
  | { type: 'LOCK_DIE'; die: number; player: PlayerId }
  | { type: 'UNLOCK_DIE'; die: number; player: PlayerId }
  | { type: 'FINISH_ROLLING'; player: PlayerId }
  | { type: 'ALLOCATE_DIE'; die: number; slot: number; player: PlayerId }
  | { type: 'UNALLOCATE_DIE'; slot: number; player: PlayerId }
  /** APPLY: locks the player's build (READY). */
  | { type: 'CONFIRM_ALLOCATION'; player: PlayerId }
  /** Battle clock: advances the countdown, then the real-time fight. */
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
  | { type: 'COUNTDOWN_STARTED'; ticks: number }
  | { type: 'SPECIAL_ACTIVATED'; creatureId: string; name: string }
  | { type: 'COMBAT_STARTED' }
  | { type: 'ATTACK_STARTED'; side: BattleSide }
  | { type: 'HIT'; side: BattleSide; damage: number }
  | { type: 'BLOCKED'; side: BattleSide }
  | { type: 'GUARD'; side: BattleSide }
  | { type: 'DASH'; side: BattleSide }
  /** Dash pressed but not performed (no cooldown spent, except 'cooldown' itself). */
  | { type: 'DASH_DENIED'; side: BattleSide; reason: 'noDirection' | 'blocked' | 'cooldown' | 'noDash' }
  | { type: 'DASH_HIT'; side: BattleSide; damage: number }
  | { type: 'SPECIAL_TRIGGERED'; side: BattleSide; name: string }
  | { type: 'PROJECTILE_FIRED'; side: BattleSide }
  | { type: 'PROJECTILE_BOUNCED'; side: BattleSide }
  /** A projectile impact (x, y in combat units); `hit` = the opponent was inside the shockwave. */
  | { type: 'IMPACT'; side: BattleSide; x: number; y: number; radius: number; hit: boolean }
  | { type: 'KNOCKBACK'; side: BattleSide; distance: number }
  | { type: 'COMBAT_ENDED'; outcome: BattleOutcome }
  | { type: 'CREATURE_DIED'; creatureId: string }
  | { type: 'POWER_POINT_CAPTURED'; x: number; y: number; owner: PlayerId }
  | { type: 'TURN_STARTED'; player: PlayerId; number: number }
  | { type: 'MATCH_ENDED'; result: MatchResult };
