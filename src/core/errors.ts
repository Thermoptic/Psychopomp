/** Thrown by rule handlers when a command is not legal. Caught by applyCommand. */
export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleError';
  }
}

export function rule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RuleError(message);
}
