#!/bin/zsh
# usage: setup-hookfixture.sh <fixture-dir> <idleThresholdMinutes>
set -e
FX="$1"
IDLE="${2:-0}"
rm -rf "$FX"
mkdir -p "$FX/.qwen/skills/demo-skill" "$FX/home/.qwen" "$FX/data"
cat > "$FX/.qwen/skills/demo-skill/SKILL.md" <<SKILL
---
name: demo-skill
description: Deterministic fixture skill used to verify loaded-skill eviction sync.
allowedTools:
  - "Bash(echo *)"
hooks:
  PostToolUse:
    - matcher: "read_file"
      hooks:
        - type: command
          command: "date +%s%N >> $FX/hook-fires.log"
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
python3 -c "
import sys
with open('$FX/data/filler.txt','w') as f:
    for i in range(400): f.write('filler line %04d %s\n' % (i,'x'*60))
with open('$FX/data/filler2.txt','w') as f:
    for i in range(400): f.write('second line %04d %s\n' % (i,'y'*60))
"
: > "$FX/hook-fires.log"
echo "hook fixture ready: $FX (idle=$IDLE)"
