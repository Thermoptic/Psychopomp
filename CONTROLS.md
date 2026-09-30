# Controls

## Two-player local play

The game supports:

- keyboard
- two gamepads
- mouse where appropriate

## Suggested keyboard mapping

### Player 1

```text
WASD        Move / navigate
Space       Confirm
Shift       Cancel / back
Q/E         Previous / next
R           Reroll
1-5         Select dice
```

### Player 2

```text
Arrow Keys  Move / navigate
Enter       Confirm
Right Shift Cancel / back
Numpad      Optional dice shortcuts
```

These are defaults and must be configurable.

## Gamepad

Use an abstract input action layer.

Actions:

```text
move_up
move_down
move_left
move_right
confirm
cancel
pause
select
reroll
lock_die
next
previous
```

Do not hard-code Xbox/PlayStation/Nintendo button labels into the core.

The UI should translate generic actions into the correct platform glyphs.

## Two gamepads

The first local multiplayer build should support:

- Gamepad 1 -> Player 1
- Gamepad 2 -> Player 2

Keyboard may remain available as a fallback.

## Device connection

If a controller disconnects:

1. Pause gameplay.
2. Display a reconnect message.
3. Keep game state unchanged.
4. Resume after reconnection or user choice.

## Remapping

Controls should eventually support remapping.

At minimum, the architecture must not prevent remapping later.
