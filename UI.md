# UI / UX

## Main screen

The main match view should be divided into:

```text
┌────────────────────────────────────────────────────────────┐
│                         MATCH HEADER                       │
├───────────────┬────────────────────────────┬───────────────┤
│   PLAYER 1    │                            │    PLAYER 2   │
│   creature    │          BOARD             │   creature    │
│   stats        │                            │   stats       │
│   dice info    │                            │   dice info   │
├───────────────┴────────────────────────────┴───────────────┤
│                     TURN / MESSAGE BAR                    │
└────────────────────────────────────────────────────────────┘
```

The supplied mockup should guide the visual hierarchy.

## Board

The board is the visual center.

Requirements:

- clear grid
- obvious occupied cells
- obvious Power Points
- faction identity
- selected creature highlight
- legal movement preview
- battle target highlight
- clear turn indicator

## Player panels

Show:

- creature portrait
- name
- current HP / max HP
- movement
- Power
- Speed
- Shield
- Special status

During battle also show:

- dice
- locked/unlocked state
- rerolls remaining
- allocation
- active Special

## Dice UI

Each die should have at least three states:

- available
- locked
- allocated

The player must be able to understand these without reading text.

## Battle transition

When a board capture occurs:

1. Briefly emphasize both creatures.
2. Transition into the dice phase.
3. Clearly state whose dice are currently being prepared.
4. Reveal both builds.
5. Transition into combat.

Do not hide why combat started.

## Combat HUD

Show:

- both creature names
- current HP
- effective stats
- active Special
- battle timer if applicable

Avoid clutter.

## Editor UI

The editor should use the same visual language as the match screen.

Important:

- editor must be usable with mouse
- keyboard navigation is desirable
- gamepad navigation should be considered
- all important fields should be visible without opening many modal windows

## Responsive/browser layout

Desktop:

- board centered
- player panels left/right
- large combat area

Small browser window:

- board remains primary
- panels collapse or move above/below
- dice phase becomes a focused screen

The browser version must remain playable at common laptop resolutions.

## Pixel-art handling

If the art style uses pixel art:

- use nearest-neighbor scaling
- avoid accidental interpolation
- preserve intended pixel size
- use integer scaling where practical

## Typography

The final font is a content/design decision.

The UI should support:

- primary display font
- body font
- numeric/stat font

Fonts must be local assets so the offline build does not depend on web fonts.
