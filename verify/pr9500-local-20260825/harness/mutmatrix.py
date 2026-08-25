import subprocess, sys, json, os, shutil
HEAD = "/private/tmp/claude-501/-Users-wenshao-git-qwen-code-x3/af487a97-f8f6-46d0-ad9e-6b33f9b08f58/scratchpad/head"
SP = os.path.dirname(HEAD)

MUTATIONS = [
    ("M2-unloadSkills-noop",
     "packages/core/src/tools/skill.ts",
     "  unloadSkills(names: Iterable<string>): void {\n    for (const name of names) {\n      this.loadedSkillNames.delete(name);\n    }\n  }",
     "  unloadSkills(_names: Iterable<string>): void {\n    /* MUTATION: no-op */\n  }",
     ["src/tools/skill.test.ts","src/tools/skill-utils.test.ts","src/services/microcompaction/microcompact.test.ts","src/services/memoryPressureMonitor.test.ts","src/core/geminiChat.test.ts"]),
    ("M3-strip-untrack-removed",
     "packages/core/src/core/geminiChat.ts",
     "      if (!this.isForkedChat) {\n        unloadSkillsFromEntries(",
     "      if (false && !this.isForkedChat) {\n        unloadSkillsFromEntries(",
     ["src/core/geminiChat.test.ts","src/core/client.test.ts"]),
    ("M4-keptSkillNames-empty",
     "packages/core/src/services/microcompaction/microcompact.ts",
     "  const kept = new Set<string>();\n  for (const ref of refs) {\n    if (clearRefKeys.has(refKey(ref))) continue;",
     "  const kept = new Set<string>();\n  for (const ref of refs) {\n    if (true) continue;\n    if (clearRefKeys.has(refKey(ref))) continue;",
     ["src/services/microcompaction/microcompact.test.ts","src/core/geminiChat.test.ts"]),
    ("M5-hook-dedup-removed",
     "packages/core/src/hooks/registerSkillHooks.ts",
     "        if (alreadyRegistered) {",
     "        if (false && alreadyRegistered) {",
     ["src/hooks/registerSkillHooks.test.ts"]),
    ("M6-permission-dedup-removed",
     "packages/core/src/permissions/permission-manager.ts",
     "      if (this.sessionRules.allow.some((r) => r.raw === rule.raw)) {\n        return;\n      }\n      this.sessionRules.allow.push(rule);",
     "      this.sessionRules.allow.push(rule);",
     ["src/permissions/permission-manager.test.ts"]),
    ("M7-forkedChat-guard-removed",
     "packages/core/src/core/geminiChat.ts",
     "  reconcileLoadedSkillTracking(logTag: string): void {\n    if (this.isForkedChat) {\n      return;\n    }",
     "  reconcileLoadedSkillTracking(logTag: string): void {\n    if (false) {\n      return;\n    }",
     ["src/agents/forkedAgent.cache.test.ts","src/core/geminiChat.test.ts"]),
]

results = []
for name, rel, old, new, suites in MUTATIONS:
    path = os.path.join(HEAD, rel)
    src = open(path).read()
    if src.count(old) != 1:
        results.append({"mutation": name, "status": "ANCHOR-MISS", "count": src.count(old)})
        continue
    open(path, "w").write(src.replace(old, new, 1))
    try:
        p = subprocess.run(
            ["npx","vitest","run","--reporter=dot","--coverage.enabled=false", *suites],
            cwd=os.path.join(HEAD,"packages/core"), capture_output=True, text=True, timeout=2400)
        out = p.stdout + p.stderr
        fails = [l.strip() for l in out.splitlines() if l.strip().startswith("FAIL")]
        import re
        m = re.search(r"Tests\s+(\d+) failed \| (\d+) passed", out)
        results.append({
            "mutation": name, "file": rel, "suites": suites,
            "exit": p.returncode,
            "tests_failed": int(m.group(1)) if m else 0,
            "killed": p.returncode != 0,
            "sample_failures": fails[:4],
        })
    finally:
        subprocess.run(["git","checkout","HEAD","--",rel], cwd=HEAD, check=True)
    print(json.dumps(results[-1], indent=1), flush=True)

open(os.path.join(SP,"mutation-matrix.json"),"w").write(json.dumps(results, indent=2))
