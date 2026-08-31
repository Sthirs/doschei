#!/usr/bin/env node
// scripts/pure-loc.mjs
//
// Canonical "pure LOC" measurement script for the module-size ceiling.
//
// Pure LOC := non-blank lines remaining after comment removal, counted across
// ALL top-level SFC blocks.
//   - .ts files: strip `//` line comments and `/* */` block comments, in a
//     string/template-literal-aware way (never strip inside a string or
//     template literal).
//   - .vue files: use @vue/compiler-sfc's parse() to locate <script>,
//     <template>, <style> blocks (never a regex — nested <template v-if>
//     blocks make naive regex block-boundary detection silently undercount).
//     <script>/<script setup> content uses the same TS comment-stripping
//     rules. <template> strips <!-- --> HTML comments. <style> strips
//     /* */ CSS comments. <template> and <style> lines DO count.
//
// Usage:
//   node scripts/pure-loc.mjs <glob...> [--over <n>]
//
// Prints "<pureLOC>\t<path>" per file, one per line, sorted by pureLOC
// descending then path ascending (deterministic across repeated runs).
// With --over <n>, only files whose pureLOC exceeds n are printed.

import { globSync } from "node:fs";
import { readFileSync } from "node:fs";
import { parse as parseSfc } from "@vue/compiler-sfc";

/**
 * Strip TypeScript `//` and `/* *\/` comments from source text, in a
 * string/template-literal-aware way. Newlines inside multi-line block
 * comments are preserved (emitted as blank lines) so line numbering stays
 * stable. Known limitation: regex literals are not distinguished from `/`
 * division operators, so a regex containing the exact substring `/*` or `//`
 * could in theory be misparsed; this does not occur in the codebase today.
 */
function stripTsComments(source) {
  let out = "";
  let i = 0;
  const n = source.length;
  // Stack of open template literals. Each frame tracks the brace depth of
  // any `${ ... }` interpolation currently open inside that template.
  const templateStack = [];

  while (i < n) {
    const top = templateStack[templateStack.length - 1];
    const inTemplateText = top !== undefined && top.braceDepth === 0;

    if (inTemplateText) {
      const c = source[i];
      if (c === "\\") {
        out += c + (source[i + 1] ?? "");
        i += 2;
        continue;
      }
      if (c === "`") {
        templateStack.pop();
        out += c;
        i += 1;
        continue;
      }
      if (c === "$" && source[i + 1] === "{") {
        top.braceDepth = 1;
        out += "${";
        i += 2;
        continue;
      }
      out += c;
      i += 1;
      continue;
    }

    const c = source[i];
    const c2 = source[i + 1];

    if (c === "/" && c2 === "/") {
      let j = i + 2;
      while (j < n && source[j] !== "\n") j += 1;
      i = j; // stop right before the newline; it is emitted on next pass
      continue;
    }

    if (c === "/" && c2 === "*") {
      let j = i + 2;
      while (j < n - 1 && !(source[j] === "*" && source[j + 1] === "/")) j += 1;
      const end = Math.min(j + 2, n);
      const comment = source.slice(i, end);
      const newlineCount = (comment.match(/\n/g) ?? []).length;
      out += "\n".repeat(newlineCount);
      i = end;
      continue;
    }

    if (c === "'" || c === '"') {
      const quote = c;
      out += c;
      i += 1;
      while (i < n) {
        const ch = source[i];
        if (ch === "\\") {
          out += ch + (source[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += ch;
        i += 1;
        if (ch === quote) break;
        if (ch === "\n") break; // unterminated string literal, bail out of it
      }
      continue;
    }

    if (c === "`") {
      templateStack.push({ braceDepth: 0 });
      out += c;
      i += 1;
      continue;
    }

    if (top !== undefined) {
      // Inside a `${ ... }` interpolation: track brace depth so we know
      // when we return to template text.
      if (c === "{") {
        top.braceDepth += 1;
        out += c;
        i += 1;
        continue;
      }
      if (c === "}") {
        top.braceDepth -= 1;
        out += c;
        i += 1;
        continue;
      }
    }

    out += c;
    i += 1;
  }

  return out;
}

/** Strip HTML `<!-- -->` comments, preserving embedded newlines as blanks. */
function stripHtmlComments(source) {
  return source.replace(/<!--[\s\S]*?-->/g, (match) =>
    "\n".repeat((match.match(/\n/g) ?? []).length),
  );
}

/** Strip CSS `/* *\/` comments, preserving embedded newlines as blanks. */
function stripCssComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (match) =>
    "\n".repeat((match.match(/\n/g) ?? []).length),
  );
}

/** Count non-blank lines in already-comment-stripped text. */
function countNonBlankLines(strippedSource) {
  return strippedSource.split("\n").filter((line) => line.trim().length > 0)
    .length;
}

function pureLocForTs(source) {
  return countNonBlankLines(stripTsComments(source));
}

function pureLocForVue(source) {
  const { descriptor } = parseSfc(source, { filename: "input.vue" });
  let total = 0;

  if (descriptor.script) {
    total += pureLocForTs(descriptor.script.content);
  }
  if (descriptor.scriptSetup) {
    total += pureLocForTs(descriptor.scriptSetup.content);
  }
  if (descriptor.template) {
    total += countNonBlankLines(stripHtmlComments(descriptor.template.content));
  }
  for (const style of descriptor.styles ?? []) {
    total += countNonBlankLines(stripCssComments(style.content));
  }

  return total;
}

function pureLocForFile(filePath) {
  const source = readFileSync(filePath, "utf8");
  if (filePath.endsWith(".vue")) {
    return pureLocForVue(source);
  }
  return pureLocForTs(source);
}

function parseArgs(argv) {
  const patterns = [];
  let over;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--over") {
      const value = argv[i + 1];
      if (value === undefined || Number.isNaN(Number(value))) {
        throw new Error("--over requires a numeric argument");
      }
      over = Number(value);
      i += 1;
      continue;
    }
    patterns.push(arg);
  }

  if (patterns.length === 0) {
    throw new Error("usage: node scripts/pure-loc.mjs <glob...> [--over <n>]");
  }

  return { patterns, over };
}

function resolveFiles(patterns) {
  const files = new Set();
  for (const pattern of patterns) {
    for (const match of globSync(pattern, { cwd: process.cwd() })) {
      files.add(match);
    }
  }
  return [...files];
}

function main() {
  const { patterns, over } = parseArgs(process.argv.slice(2));
  const files = resolveFiles(patterns);

  const results = files.map((filePath) => ({
    path: filePath,
    pureLoc: pureLocForFile(filePath),
  }));

  results.sort((a, b) => b.pureLoc - a.pureLoc || a.path.localeCompare(b.path));

  const filtered =
    over === undefined ? results : results.filter((r) => r.pureLoc > over);

  for (const { pureLoc, path } of filtered) {
    console.log(`${pureLoc}\t${path}`);
  }
}

main();
