// What the board's info panel shows on its MOVEMENT line. Presentation only:
// legal moves always come from core/board/movement.ts.

import { MOVE_PRESETS, isPatternMovement, patternCells, type CreatureDef } from '../core';

const key = (c: { x: number; y: number }) => `${c.x},${c.y}`;

/** "3 STEPS" for DEFAULT, a preset's name (e.g. "KNIGHT") for a ready-made pattern, else "CUSTOM". */
export function movementText(def: CreatureDef): string {
  if (!isPatternMovement(def)) return `${def.stats.movement} STEP${def.stats.movement === 1 ? '' : 'S'}`;
  const cells = new Set(patternCells(def).map(key));
  const preset = MOVE_PRESETS.find((p) => {
    const pc = p.cells();
    return pc.length === cells.size && pc.every((c) => cells.has(key(c)));
  });
  return preset ? preset.id.toUpperCase() : 'CUSTOM';
}
