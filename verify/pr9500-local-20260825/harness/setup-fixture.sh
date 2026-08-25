#!/bin/zsh
# usage: setup-fixture.sh <fixture-dir> <idleThresholdMinutes>
set -e
FX="$1"
IDLE="${2:--1}"
rm -rf "$FX"
mkdir -p "$FX/.qwen/skills/demo-skill" "$FX/home/.qwen" "$FX/data"
cat > "$FX/.qwen/skills/demo-skill/SKILL.md" <<'SKILL'
---
name: demo-skill
description: Deterministic fixture skill used to verify loaded-skill eviction sync.
---

# Demo Skill

MARKER-DEMO-SKILL-BODY-7F3A

Step 1: announce the marker above.
Step 2: do nothing else.
SKILL
cat > "$FX/home/.qwen/settings.json" <<JSON
{
  "context": {
    "clearContextOnIdle": {
      "toolResultsThresholdMinutes": $IDLE,
      "toolResultsNumToKeep": 1
    }
  },
  "ui": { "theme": "Dracula" },
  "privacy": { "usageStatisticsEnabled": false }
}
JSON
python3 - "$FX/data/filler.txt" <<'PY'
import sys
with open(sys.argv[1], 'w') as f:
    for i in range(400):
        f.write("filler line %04d %s\n" % (i, "x" * 60))
PY
echo "fixture ready: $FX (idle=$IDLE)"
