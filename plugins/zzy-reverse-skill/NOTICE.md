This directory is a marketplace packaging of:

  https://github.com/zhaoxuya520/reverse-skill

Original license: MIT (see LICENSE). Copyright (c) 2026 zhaoxuya520.

Packaging notes for CCode (jnmhub-ccode-market):

- Plugin id: zzy-reverse-skill
- Directory paths inside the pack are unchanged so internal routing
  (`ida-reverse/`, `reverse-engineering/`, …) still works.
- Two CCode-visible skill names collide with independent plugins in this
  marketplace, so only the frontmatter `name` of those two files is prefixed:

    skills/ida-reverse/SKILL.md           -> zzy-ida-reverse
    skills/reverse-engineering/SKILL.md   -> zzy-reverse-engineering

- The master-control file skills/SKILL.md had no frontmatter in upstream;
  this packaging adds `name: zzy-reverse-skill`.
- CCode plugin skill scan is one level per declared root. plugin.json therefore
  lists `skills`, `CTF-Sandbox-Orchestrator`, and `skills/pentest-tools` so the
  competition-* skills and src-hunter are discovered.
- The upstream 1.6MB reverse-skill.png is not copied; the market card uses the
  128×128 transparent icon generated for this marketplace.

- `plugin.json` declares `requires` so the client can check the runtime before the
  pack is used, instead of letting `npx` / helper scripts fail later:

      "requires": {
        "node":   { "minVersion": "22.12" },
        "python": {}
      }

  `node >= 22.12` is the floor the upstream README states ("Required for JS/MCP");
  Python is declared without a version because upstream only says "Python 3.x —
  Frida and helper scripts" (commonly used rather than required), and an invented
  floor would show as a false failure. Java/JDK is needed for jadx and apktool but
  has no place in this schema (it only carries python/node), so it is documented in
  the marketplace description instead of declared here.
