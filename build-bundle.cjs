#!/usr/bin/env node
/**
 * Simple ES module bundler — no dependencies.
 * Reads src/main.js, recursively resolves all imports, and outputs a single
 * bundle.js that works as a classic <script> (no ES module imports needed).
 *
 * Usage: node build-bundle.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const ENTRY = path.join(SRC, 'main.js');
const OUT = path.join(ROOT, 'bundle.js');

// --- Collect all source files ---
const modules = new Map(); // absPath -> { code, imports: [{names, path, isDefault, isNamespace}], exports: {named: [], default: bool} }

function resolveImport(fromFile, importPath) {
  const resolved = path.resolve(path.dirname(fromFile), importPath);
  if (fs.existsSync(resolved)) return resolved;
  if (fs.existsSync(resolved + '.js')) return resolved + '.js';
  throw new Error(`Cannot resolve ${importPath} from ${fromFile}`);
}

function parseModule(filePath) {
  if (modules.has(filePath)) return modules.get(filePath);
  const code = fs.readFileSync(filePath, 'utf8');
  const mod = { code, imports: [], exports: { named: new Set(), default: null }, filePath };
  modules.set(filePath, mod); // set early to handle circular deps

  // Parse imports (handle multi-line)
  const importRegex = /import\s+(?:([^'";]+?)\s+from\s+)?['"]([^'"]+)['"]/g;
  let m;
  while ((m = importRegex.exec(code))) {
    const clause = m[1]?.trim();
    const importPath = m[2];
    const resolved = resolveImport(filePath, importPath);
    const imp = { path: resolved, names: [], default: null, namespace: null, sideEffect: false };

    if (!clause) {
      imp.sideEffect = true;
    } else if (clause.startsWith('*')) {
      // import * as ns from '...'
      const nsMatch = clause.match(/\*\s+as\s+(\w+)/);
      imp.namespace = nsMatch ? nsMatch[1] : null;
    } else if (clause.startsWith('{')) {
      // import { a, b as c } from '...'
      const inner = clause.replace(/^\{/, '').replace(/\}$/, '');
      imp.names = inner.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
        const parts = s.split(/\s+as\s+/);
        return { imported: parts[0].trim(), local: (parts[1] || parts[0]).trim() };
      });
    } else {
      // import x from '...' (default import, possibly with named)
      const defaultMatch = clause.match(/^(\w+)/);
      if (defaultMatch) imp.default = defaultMatch[1];
      // Check for mixed: import x, { a } from '...'
      const namedMatch = clause.match(/\{([^}]+)\}/);
      if (namedMatch) {
        imp.names = namedMatch[1].split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
          const parts = s.split(/\s+as\s+/);
          return { imported: parts[0].trim(), local: (parts[1] || parts[0]).trim() };
        });
      }
    }
    mod.imports.push(imp);
    // Recursively parse imported module
    parseModule(resolved);
  }

  // Parse dynamic imports: import('./x.js') — module must be in the bundle
  const dynImportRegex = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dynImportRegex.exec(code))) {
    const resolved = resolveImport(filePath, m[1]);
    mod.imports.push({ path: resolved, names: [], default: null, namespace: null, sideEffect: true, dynamic: true });
    parseModule(resolved);
  }

  // Parse exports
  // export const/let/var x = ...
  const exportDeclRegex = /^export\s+(?:const|let|var)\s+(\w+)/gm;
  while ((m = exportDeclRegex.exec(code))) mod.exports.named.add(m[1]);

  // export function f / export async function f
  const exportFnRegex = /^export\s+(?:async\s+)?function\s+(\w+)/gm;
  while ((m = exportFnRegex.exec(code))) mod.exports.named.add(m[1]);

  // export class C
  const exportClassRegex = /^export\s+class\s+(\w+)/gm;
  while ((m = exportClassRegex.exec(code))) mod.exports.named.add(m[1]);

  // export default (including named function/class declarations)
  const exportDefaultRegex = /^export\s+default\b/m;
  if (exportDefaultRegex.test(code)) mod.exports.default = true;

  // export { a, b, c }
  const exportListRegex = /^export\s+\{([^}]+)\}/gm;
  while ((m = exportListRegex.exec(code))) {
    m[1].split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => {
      const parts = s.split(/\s+as\s+/);
      mod.exports.named.add((parts[1] || parts[0]).trim());
    });
  }

  return mod;
}

// --- Topological sort ---
const sorted = [];
const visited = new Set();
const visiting = new Set();

function visit(mod) {
  if (visited.has(mod.filePath)) return;
  if (visiting.has(mod.filePath)) return; // circular dep — skip
  visiting.add(mod.filePath);
  for (const imp of mod.imports) {
    const dep = modules.get(imp.path);
    if (dep) visit(dep);
  }
  visiting.delete(mod.filePath);
  visited.add(mod.filePath);
  sorted.push(mod);
}

parseModule(ENTRY);
visit(modules.get(ENTRY));

// --- Transform each module ---
function moduleId(filePath) {
  return path.relative(SRC, filePath).replace(/\\/g, '/');
}

function transformModule(mod) {
  let code = mod.code;
  const id = moduleId(mod.filePath);

  // Replace static imports with __require calls
  // Multi-line and single-line imports
  code = code.replace(
    /import\s+([^'";]+?)\s+from\s+['"]([^'"]+)['"]\s*;?/g,
    (match, clause, importPath) => {
      const resolved = resolveImport(mod.filePath, importPath);
      const depId = moduleId(resolved);
      const c = clause.trim();
      if (c.startsWith('*')) {
        const ns = c.match(/\*\s+as\s+(\w+)/)[1];
        return `const ${ns} = __require(${JSON.stringify(depId)});`;
      }
      if (c.startsWith('{')) {
        const inner = c.replace(/^\{/, '').replace(/\}$/, '');
        const names = inner.split(',').map((s) => s.trim()).filter(Boolean);
        const destructured = names.map((s) => {
          const parts = s.split(/\s+as\s+/);
          return parts.length > 1 ? `${parts[0].trim()}: ${parts[1].trim()}` : parts[0].trim();
        });
        return `const { ${destructured.join(', ')} } = __require(${JSON.stringify(depId)});`;
      }
      // default import (possibly with named)
      const parts = c.split(/,(.+)/);
      const defaultName = parts[0].trim();
      let result = `const ${defaultName} = __require(${JSON.stringify(depId)}).default;`;
      if (parts[1]) {
        const inner = parts[1].trim().replace(/^\{/, '').replace(/\}$/, '');
        const names = inner.split(',').map((s) => s.trim()).filter(Boolean);
        const destructured = names.map((s) => {
          const p = s.split(/\s+as\s+/);
          return p.length > 1 ? `${p[0].trim()}: ${p[1].trim()}` : p[0].trim();
        });
        result += ` const { ${destructured.join(', ')} } = __require(${JSON.stringify(depId)});`;
      }
      return result;
    },
  );

  // Side-effect imports: import './x.js'
  code = code.replace(
    /import\s+['"]([^'"]+)['"]\s*;?/g,
    (match, importPath) => {
      const resolved = resolveImport(mod.filePath, importPath);
      return `__require(${JSON.stringify(moduleId(resolved))});`;
    },
  );

  // Dynamic imports: await import('./x.js')
  code = code.replace(
    /import\(\s*['"]([^'"]+)['"]\s*\)/g,
    (match, importPath) => {
      const resolved = resolveImport(mod.filePath, importPath);
      return `Promise.resolve(__require(${JSON.stringify(moduleId(resolved))}))`;
    },
  );

  // Replace import.meta (parse-time error in classic scripts) with a safe shim
  code = code.replace(/import\.meta/g, '({ env: {} })');

  // Transform exports — remove "export " prefix
  code = code.replace(/^export\s+(const|let|var|function|class|async\s+function)\s+/gm, '$1 ');
  code = code.replace(/^export\s+default\s+/gm, '__default_export__ = ');

  // Handle export { a, b } at end of file
  const exportAssignments = [];
  code = code.replace(/^export\s+\{([^}]+)\}\s*;?/gm, (match, list) => {
    list.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => {
      const parts = s.split(/\s+as\s+/);
      const local = parts[0].trim();
      const exported = (parts[1] || parts[0]).trim();
      exportAssignments.push(`__exports.${exported} = ${local};`);
    });
    return '';
  });

  // Collect named exports and add assignments at the end
  for (const name of mod.exports.named) {
    exportAssignments.push(`__exports.${name} = ${name};`);
  }
  if (mod.exports.default) {
    if (mod.exports.default === true) {
      // Anonymous default export: __default_export__ was assigned above
      exportAssignments.push(`__exports.default = __default_export__;`);
    } else {
      exportAssignments.push(`__exports.default = ${mod.exports.default};`);
    }
  }

  // Wrap in module function
  const body = (mod.exports.default ? 'let __default_export__;\n' : '') + code + '\n' + exportAssignments.join('\n');
  return `__modules[${JSON.stringify(id)}] = function(__exports) {\n${body}\n};`;
}

// --- Generate bundle ---
let bundle = `/**
 * BIMDesign — bundled for file:// usage.
 * Generated by build-bundle.cjs — do not edit manually.
 * Run "node build-bundle.cjs" to regenerate after changes.
 */
(function() {
'use strict';
var __modules = {};
var __cache = {};
function __require(id) {
  if (__cache[id]) return __cache[id];
  var exports = {};
  __cache[id] = exports;
  __modules[id](exports);
  return exports;
}
`;

for (const mod of sorted) {
  bundle += '\n// --- ' + moduleId(mod.filePath) + ' ---\n';
  bundle += transformModule(mod) + '\n';
}

bundle += `\n// --- Entry point ---\n`;
bundle += `__require(${JSON.stringify(moduleId(ENTRY))});\n`;
bundle += `})();\n`;

fs.writeFileSync(OUT, bundle);
console.log(`Bundle gerado: ${OUT}`);
console.log(`  ${sorted.length} módulos, ${(bundle.length / 1024).toFixed(0)} KB`);
