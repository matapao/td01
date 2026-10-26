/** Executable module boundaries and growth budgets, parsed with the pinned formatter's TS parser. */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { parsers } from 'prettier/plugins/typescript';
const root = process.cwd();
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
/** @param {unknown} value @returns {Record<string, unknown> | null} */
function record(value) {
  return isRecord(value) ? value : null;
}
/** @param {unknown} value @returns {Record<string, unknown>[]} */
function records(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
const rawBudgets = record(JSON.parse(readFileSync('scripts/module-budgets.json', 'utf8')));
if (
  !rawBudgets ||
  Object.values(rawBudgets).some(
    (value) => typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1,
  )
)
  throw new Error('Invalid module growth budgets');
/** @type {string[]} */
const errors = [];
/** @type {Map<string, string[]>} */
const runtimeImports = new Map();
/** @type {[string, string][]} */
const coordinators = [
  ['src/view/controls/', 'src/view/input'],
  ['src/view/entity/', 'src/view/entities'],
  ['src/game/content/', 'src/game/content'],
  ['src/ui/hud/', 'src/ui/hud'],
  ['src/view/mine/', 'src/view/mineview'],
  ['src/game/systems/crafting/', 'src/game/systems/craft'],
  ['src/game/systems/hero/', 'src/game/systems/heroes'],
  ['src/game/systems/combat/', 'src/game/systems/combat'],
];
/** @param {string} dir @returns {string[]} */
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(`${dir}/${e.name}`) : e.name.endsWith('.ts') ? [`${dir}/${e.name}`] : [],
  );
}
const sourceFiles = [...files('src'), ...files('server')];
const sourcePaths = new Set(sourceFiles);
/** @param {string} target */
function sourcePath(target) {
  // Match the compiler's supported local spellings before traversing the runtime graph.
  for (const candidate of [target, target.replace(/\.js$/, '.ts'), `${target}.ts`, `${target}/index.ts`])
    if (sourcePaths.has(candidate)) return candidate;
  return target;
}
for (const file of sourceFiles) {
  const source = readFileSync(file, 'utf8'),
    lines = source.trimEnd().split('\n').length,
    limit = rawBudgets[file] ?? 600;
  if (typeof limit !== 'number') throw new Error('Invalid module growth budget');
  if (file !== 'src/ui/glyph-data.ts' && lines > limit)
    errors.push(`${file}: ${lines} lines exceeds ${limit}; extract a focused module`);
  /** Formatter parser options use the pinned shared style; only the AST is consumed. */
  const ast = await parsers.typescript.parse(source, {
    locStart: parsers.typescript.locStart,
    locEnd: parsers.typescript.locEnd,
    originalText: source,
    printWidth: 110,
    tabWidth: 2,
    useTabs: false,
    semi: true,
    singleQuote: true,
    jsxSingleQuote: false,
    trailingComma: 'all',
    bracketSpacing: true,
    objectWrap: 'preserve',
    bracketSameLine: false,
    rangeStart: 0,
    rangeEnd: Infinity,
    parser: 'typescript',
    filepath: file,
    requirePragma: false,
    insertPragma: false,
    checkIgnorePragma: false,
    proseWrap: 'preserve',
    arrowParens: 'always',
    plugins: [],
    htmlWhitespaceSensitivity: 'css',
    endOfLine: 'lf',
    quoteProps: 'as-needed',
    vueIndentScriptAndStyle: false,
    embeddedLanguageFormatting: 'auto',
    singleAttributePerLine: false,
    experimentalOperatorPosition: 'end',
    experimentalTernaries: false,
  });
  /** @param {unknown} value */
  function visit(value) {
    const node = record(value);
    if (!node) return;
    const type = node['type'];
    const source = record(node['source']);
    let specifier;
    if (
      typeof type === 'string' &&
      ['ImportDeclaration', 'ExportAllDeclaration', 'ExportNamedDeclaration'].includes(type)
    )
      specifier = source?.['value'];
    if (type === 'ImportExpression') {
      specifier = source?.['value'];
      if (
        source?.['type'] === 'TemplateLiteral' &&
        Array.isArray(source['expressions']) &&
        !source['expressions'].length
      )
        specifier = record(records(source['quasis'])[0]?.['value'])?.['cooked'];
    }
    if (type === 'TSImportType') {
      const argument = record(node['argument']);
      specifier = argument?.['value'] ?? record(argument?.['literal'])?.['value'];
    }
    if (typeof specifier === 'string') {
      const target = specifier.startsWith('.')
        ? sourcePath(relative(root, resolve(dirname(file), specifier)).replaceAll('\\', '/'))
        : specifier;
      const module = target.replace(/\.(?:ts|js)$/, '');
      if (coordinators.some(([directory, owner]) => file.startsWith(directory) && module === owner))
        errors.push(
          `${file}: submodules cannot import their coordinator ${specifier}; use the context port or a leaf module`,
        );
      // Every maintained application source dependency must stay acyclic, including value re-exports.
      // Type-only contracts do not execute and therefore do not create runtime edges.
      const valueImport =
        type === 'ImportExpression' ||
        (type === 'ImportDeclaration' &&
          node['importKind'] !== 'type' &&
          (!records(node['specifiers']).length ||
            records(node['specifiers']).some((part) => part['importKind'] !== 'type'))) ||
        (typeof type === 'string' &&
          ['ExportAllDeclaration', 'ExportNamedDeclaration'].includes(type) &&
          node['exportKind'] !== 'type' &&
          (!records(node['specifiers']).length ||
            records(node['specifiers']).some((part) => part['exportKind'] !== 'type')));
      if (sourcePaths.has(target) && valueImport) {
        const imports = runtimeImports.get(file) ?? [];
        imports.push(target);
        runtimeImports.set(file, imports);
      }
      if (file.startsWith('src/core/') && !target.startsWith('src/core/'))
        errors.push(`${file}: core cannot import ${specifier}`);
      if (file.startsWith('src/game/') && !target.startsWith('src/game/') && !target.startsWith('src/core/'))
        errors.push(`${file}: game cannot import ${specifier}`);
      if (
        file.startsWith('src/') &&
        (target.startsWith('server/') || target.startsWith('node:') || ['pg', 'ws'].includes(target))
      )
        errors.push(`${file}: browser code cannot import ${specifier}`);
      if (file.startsWith('server/') && (target.startsWith('src/ui/') || target.startsWith('src/view/')))
        errors.push(`${file}: server cannot import presentation ${specifier}`);
    }
    if ((file.startsWith('src/game/') || file.startsWith('src/core/')) && type === 'CallExpression') {
      const callee = record(node['callee']);
      const object = record(callee?.['object']);
      const property = record(callee?.['property']);
      if (
        callee?.['type'] === 'MemberExpression' &&
        object?.['type'] === 'Identifier' &&
        ((object['name'] === 'Math' && property?.['name'] === 'random') ||
          (object['name'] === 'Date' && property?.['name'] === 'now') ||
          object['name'] === 'performance')
      )
        errors.push(`${file}: deterministic code cannot use a wall clock or unseeded randomness`);
    }
    for (const [key, value] of Object.entries(node))
      if (!['comments', 'tokens', 'loc', 'range'].includes(key)) {
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') visit(value);
      }
  }
  visit(ast);
}
const visited = new Set();
const visiting = new Set();
/** @param {string} file @param {string[]} path */
function checkCycle(file, path = []) {
  if (visiting.has(file)) {
    errors.push(`Runtime module cycle: ${[...path.slice(path.indexOf(file)), file].join(' → ')}`);
    return;
  }
  if (visited.has(file)) return;
  visiting.add(file);
  for (const target of runtimeImports.get(file) ?? []) checkCycle(target, [...path, file]);
  visiting.delete(file);
  visited.add(file);
}
for (const file of runtimeImports.keys()) checkCycle(file);
const readme = readFileSync('README.md', 'utf8').trimEnd().split('\n').length;
if (readme > 50) errors.push(`README.md has ${readme} lines; maximum is 50`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(
  `PASS: import boundaries, runtime module cycles, deterministic simulation, growth budgets and ${readme}-line README`,
);
