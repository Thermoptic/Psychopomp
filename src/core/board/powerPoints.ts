// Power Point ownership rule: a Power Point belongs to the last player whose
// living creature stood on it. Ownership persists after the creature leaves.

import type { GameEvent, GameState } from '../types';
import { creatureAt } from './queries';

export function updatePowerPoints(state: GameState, events: GameEvent[]): void {
  for (const pp of state.powerPoints) {
    const occupant = creatureAt(state, pp);
    if (occupant && pp.owner !== occupant.owner) {
      pp.owner = occupant.owner;
      events.push({ type: 'POWER_POINT_CAPTURED', x: pp.x, y: pp.y, owner: occupant.owner });
    }
  }
}
