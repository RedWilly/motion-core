import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = join(import.meta.dir);
const maxDependenciesPerModule = 3;
const supportModules = new Set(['shared']);

function listTypeScriptFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      listTypeScriptFiles(fullPath, out);
      continue;
    }

    if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(fullPath);
  }

  return out;
}

function moduleName(file: string): string {
  const parts = relative(root, file).split(sep);
  return parts.length <= 1 ? '' : (parts[0] ?? '');
}

function resolveInternalModule(from: string, specifier: string): string | null {
  if (specifier.startsWith('../') || specifier.startsWith('./')) {
    const target = join(from, '..', specifier);
    const relativeTarget = relative(root, target);
    return relativeTarget.startsWith('..') ? null : (relativeTarget.split(sep)[0] ?? null);
  }

  if (specifier.startsWith('@/')) return specifier.slice(2).split('/')[0] ?? null;
  if (specifier.startsWith('@core/')) return 'core';
  if (specifier.startsWith('@animation/')) return 'animation';
  if (specifier.startsWith('@audio/')) return 'audio';
  if (specifier.startsWith('@export/')) return 'export';
  if (specifier.startsWith('@integration/')) return 'integration';

  return null;
}

function buildDependencyGraph(): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  const importPattern = /from\s+['"]([^'"]+)['"]/g;

  for (const file of listTypeScriptFiles(root)) {
    const owner = moduleName(file);
    if (!owner) continue;

    let deps = graph.get(owner);
    if (!deps) {
      deps = new Set<string>();
      graph.set(owner, deps);
    }

    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];
      if (specifier === undefined) continue;

      const target = resolveInternalModule(file, specifier);
      if (target && target !== owner) deps.add(target);
    }
  }

  return graph;
}

function hasCycle(graph: Map<string, Set<string>>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(module: string): boolean {
    if (visited.has(module) || supportModules.has(module)) return false;
    if (visiting.has(module)) return true;

    visiting.add(module);
    for (const dep of graph.get(module) ?? []) {
      if (visit(dep)) return true;
    }
    visiting.delete(module);
    visited.add(module);

    return false;
  }

  for (const module of graph.keys()) {
    if (visit(module)) return true;
  }

  return false;
}

describe('module boundaries', () => {
  test('keeps direct dependencies bounded', () => {
    const graph = buildDependencyGraph();

    for (const [module, deps] of graph) {
      if (supportModules.has(module)) continue;
      expect(deps.size, `${module} has too many direct dependencies`).toBeLessThanOrEqual(
        maxDependenciesPerModule,
      );
    }
  });

  test('prevents top-level dependency cycles', () => {
    expect(hasCycle(buildDependencyGraph())).toBe(false);
  });
});
