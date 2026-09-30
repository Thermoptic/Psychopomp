# Save and Persistence Format

## Requirements

Psychopomp is offline-first.

No cloud service is required for:

- settings
- custom creatures
- content packs
- local matches

## Save categories

### Settings

```text
audio
video
input
accessibility
gameplay
```

### Editor data

Stores custom creature definitions.

### Roster data

Stores which creatures are approved/active.

### Match data

Optional future feature for suspend/resume.

## Versioning

Every save must have:

```text
saveVersion
contentVersion
```

When loading an older save:

1. detect version
2. migrate if supported
3. otherwise provide a useful error
4. never silently corrupt data

## Browser storage

The browser version should use a persistent local storage mechanism appropriate to the chosen framework.

The game must not require a server.

## Desktop storage

Use the platform's normal application-data location.

Do not write arbitrary files beside the executable unless explicitly exporting content.

## Export/import

The editor should allow:

```text
Export Creature
Export Content Pack
Import Creature
Import Content Pack
```

Use portable text/binary formats that are documented and versioned.

## Security

Imported content should be treated as untrusted data.

Do not execute arbitrary code from a content pack.

Special abilities should use a controlled effect system rather than arbitrary scripts by default.
