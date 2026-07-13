#!/usr/bin/env node
/**
 * verify-translations.js
 * ---------------------------------------------------------------------------
 * Verifies /locals/{lang}/{label}.json translation files against how
 * OnigiriJS's Onigiri.i18n actually loads and looks them up.
 *
 * Why this exists: Onigiri.i18n.loadFromPath(basePath, locale, label, format)
 * namespaces a file's contents under `label` UNLESS label === 'messages'
 * (that exact plural string is the framework's "no namespace" sentinel).
 * Every label used in this project (message, includes, modules) is singular,
 * so every key in every file is actually looked up at runtime as
 * `${label}.${dotPathInsideTheJsonFile}` — e.g. a `"home"` key nested under
 * `"nav"` in locals/en/message.json resolves at runtime as `message.nav.home`,
 * NOT `nav.home`. This script mirrors that exact rule so a passing check here
 * means the keys actually work in the browser, not just that the JSON is
 * well-formed.
 *
 * Checks performed:
 *   1. Every locals/{lang}/{label}.json file is valid JSON.
 *   2. Every locale defines the same set of label files as the base locale.
 *   3. Every locale defines the same set of translation keys, per label, as
 *      the base locale (catches missing translations AND orphaned/typo'd
 *      keys that exist in one locale but not the base).
 *   4. Every `data-i18n="..."` / `gm_t('...')` reference found in the PHP
 *      source actually resolves in the base locale's loaded translations.
 *   5. (Warning only) Base-locale keys that no source file references —
 *      flags dead translation entries without failing the build.
 *
 * Usage:
 *   node scripts/verify-translations.js [--strict]
 *
 *   --strict   Also fail the build on warnings (unused keys).
 *
 * Exit code is non-zero if any hard error is found (or if --strict and any
 * warning is found), so this is safe to wire straight into CI.
 * ---------------------------------------------------------------------------
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ── Config ──────────────────────────────────────────────────────────────
const REPO_ROOT = process.cwd();
const LOCALS_DIR = path.join(REPO_ROOT, 'locals');
const LOCALES = ['en', 'ja', 'de'];
const BASE_LOCALE = 'en';
const NO_NAMESPACE_LABEL = 'messages'; // OnigiriJS's exact "skip namespacing" sentinel
const SOURCE_EXTENSIONS = new Set(['.php']);
const IGNORE_DIR_NAMES = new Set(['.git', 'node_modules', 'vendor', 'locals']);
const STRICT = process.argv.includes('--strict');

// Recognized top-level namespaces, used to anchor the key-usage regexes so we
// don't false-positive match unrelated dotted strings (version numbers, file
// paths, etc.) found elsewhere in the PHP source.
const KNOWN_LABELS = ['message', 'includes', 'modules'];
const LABEL_ALTERNATION = KNOWN_LABELS.join('|');

// ── Small helpers ───────────────────────────────────────────────────────
function log(msg) { process.stdout.write(msg + '\n'); }
function err(msg) { process.stderr.write(msg + '\n'); }

function walk(dir, exts, ignoreNames, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ignoreNames.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full, exts, ignoreNames, out);
        } else if (exts.has(path.extname(entry.name))) {
            out.push(full);
        }
    }
    return out;
}

/**
 * Flattens a nested JSON object into dot-notation keys, matching
 * OnigiriJS's own _getTranslation() traversal (which just does
 * key.split('.') and walks the object).
 */
function flatten(obj, prefix, out) {
    for (const [key, value] of Object.entries(obj)) {
        const nextKey = prefix ? `${prefix}.${key}` : key;
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            flatten(value, nextKey, out);
        } else {
            out[nextKey] = value;
        }
    }
    return out;
}

/**
 * Applies OnigiriJS's loadFromPath() namespacing rule: label !== 'messages'
 * means everything in the file gets prefixed with the label.
 */
function namespaceKeys(flatKeys, label) {
    if (label === NO_NAMESPACE_LABEL) return flatKeys;
    const out = {};
    for (const [key, value] of Object.entries(flatKeys)) {
        out[`${label}.${key}`] = value;
    }
    return out;
}

// ── Step 1: discover which label files exist per locale ───────────────
if (!fs.existsSync(LOCALS_DIR)) {
    err(`✗ Could not find a "locals" directory at ${LOCALS_DIR}`);
    process.exit(1);
}

const errors = [];
const warnings = [];

const labelsByLocale = {};
for (const locale of LOCALES) {
    const dir = path.join(LOCALS_DIR, locale);
    if (!fs.existsSync(dir)) {
        errors.push(`Missing locale directory: locals/${locale}/`);
        labelsByLocale[locale] = [];
        continue;
    }
    labelsByLocale[locale] = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''))
        .sort();
}

const baseLabels = new Set(labelsByLocale[BASE_LOCALE] || []);
if (baseLabels.size === 0) {
    errors.push(`Base locale "${BASE_LOCALE}" has no .json files under locals/${BASE_LOCALE}/ — nothing to verify against.`);
}

for (const locale of LOCALES) {
    if (locale === BASE_LOCALE) continue;
    const theseLabels = new Set(labelsByLocale[locale] || []);
    for (const label of baseLabels) {
        if (!theseLabels.has(label)) {
            errors.push(`locals/${locale}/${label}.json is missing (present in base locale "${BASE_LOCALE}")`);
        }
    }
    for (const label of theseLabels) {
        if (!baseLabels.has(label)) {
            warnings.push(`locals/${locale}/${label}.json has no counterpart in base locale "${BASE_LOCALE}" — extra file?`);
        }
    }
}

// ── Step 2: load + parse every JSON file, flatten + namespace its keys ─
// translations[locale][label] = { 'label.dot.path': value }
const translations = {};
const rawParseOk = {};

for (const locale of LOCALES) {
    translations[locale] = {};
    for (const label of labelsByLocale[locale] || []) {
        const filePath = path.join(LOCALS_DIR, locale, `${label}.json`);
        const raw = fs.readFileSync(filePath, 'utf8');
        try {
            const json = JSON.parse(raw);
            const flat = flatten(json, '', {});
            translations[locale][label] = namespaceKeys(flat, label);
            rawParseOk[filePath] = true;
        } catch (e) {
            errors.push(`Invalid JSON in locals/${locale}/${label}.json — ${e.message}`);
            translations[locale][label] = {};
            rawParseOk[filePath] = false;
        }
    }
}

// ── Step 3: per-label key parity across locales, vs base locale ───────
for (const label of baseLabels) {
    const baseKeys = new Set(Object.keys(translations[BASE_LOCALE][label] || {}));

    for (const locale of LOCALES) {
        if (locale === BASE_LOCALE) continue;
        const localeTable = translations[locale][label] || {};
        const localeKeys = new Set(Object.keys(localeTable));

        const missing = [...baseKeys].filter((k) => !localeKeys.has(k));
        const extra = [...localeKeys].filter((k) => !baseKeys.has(k));

        for (const key of missing) {
            errors.push(`[${locale}/${label}.json] missing key "${key}" (present in ${BASE_LOCALE}/${label}.json)`);
        }
        for (const key of extra) {
            warnings.push(`[${locale}/${label}.json] has key "${key}" not present in ${BASE_LOCALE}/${label}.json — typo, or ${BASE_LOCALE} is out of date?`);
        }
    }
}

// ── Step 4: build one merged base-locale lookup table for usage checks ─
const baseLookup = {};
for (const label of baseLabels) {
    Object.assign(baseLookup, translations[BASE_LOCALE][label] || {});
}

// ── Step 5: scan PHP source for data-i18n="..." and gm_t('...') usage ──
const sourceFiles = fs.existsSync(REPO_ROOT)
    ? walk(REPO_ROOT, SOURCE_EXTENSIONS, IGNORE_DIR_NAMES)
    : [];

// Matches a literal key straight out of a data-i18n="..." attribute.
const RE_DATA_I18N = new RegExp(`data-i18n="((?:${LABEL_ALTERNATION})\\.[a-zA-Z0-9_.]+)"`, 'g');

// Matches keys built inline in PHP expressions, e.g.
//   data-i18n="<?= $x ? 'modules.btn.subscribe' : 'modules.btn.buy_now' ?>"
// or PHP match()/ternary arms that resolve to a namespaced key string.
const RE_PHP_STRING_KEY = new RegExp(`['"]((?:${LABEL_ALTERNATION})\\.[a-zA-Z0-9_.]+)['"]`, 'g');

// Matches JS-side gm_t('key', 'fallback') calls used for dynamically built
// strings (notifications, confirm() prompts, etc).
const RE_GM_T = new RegExp(`gm_t\\(\\s*['"]((?:${LABEL_ALTERNATION})\\.[a-zA-Z0-9_.]+)['"]`, 'g');

// Matches dynamically-assembled keys like:
//   data-i18n="modules.badge.<?= $intervalKey ?>"
// These can't be statically resolved to one key, so we instead collect the
// static prefix + note it separately so a human can eyeball the branches
// (e.g. the match()/switch arms) rather than silently skipping verification.
const RE_DYNAMIC_SUFFIX = new RegExp(`data-i18n="((?:${LABEL_ALTERNATION})\\.[a-zA-Z0-9_.]*)\\.?<\\?=`, 'g');

const usedKeys = new Set();
const dynamicPrefixes = new Set();

for (const file of sourceFiles) {
    const content = fs.readFileSync(file, 'utf8');

    for (const match of content.matchAll(RE_DATA_I18N)) usedKeys.add(match[1]);
    for (const match of content.matchAll(RE_PHP_STRING_KEY)) usedKeys.add(match[1]);
    for (const match of content.matchAll(RE_GM_T)) usedKeys.add(match[1]);
    for (const match of content.matchAll(RE_DYNAMIC_SUFFIX)) {
        const prefix = match[1].replace(/\.$/, ''); // normalize away any trailing dot
        dynamicPrefixes.add(`${prefix} (${path.relative(REPO_ROOT, file)})`);
    }
}

for (const key of usedKeys) {
    if (!(key in baseLookup)) {
        errors.push(`Key "${key}" is referenced in source but missing from every locals/${BASE_LOCALE}/*.json file`);
    }
}

// ── Step 6 (warning only): base keys that no source file references ───
const dynamicPrefixList = [...dynamicPrefixes].map((entry) => entry.split(' (')[0]);
const unused = Object.keys(baseLookup).filter((k) => {
    if (usedKeys.has(k)) return false;
    // Suppress false positives for keys only ever reached through a dynamic
    // suffix (e.g. modules.badge.monthly via modules.badge.<?= $x ?>)
    return !dynamicPrefixList.some((prefix) => k.startsWith(prefix + '.'));
});

for (const key of unused) {
    warnings.push(`Key "${key}" exists in ${BASE_LOCALE} translations but is never referenced by any .php source file`);
}

// ── Report ──────────────────────────────────────────────────────────────
log('');
log('OnigiriJS translation verification');
log('===================================');
log(`Base locale:     ${BASE_LOCALE}`);
log(`Locales checked: ${LOCALES.join(', ')}`);
log(`Label files:     ${[...baseLabels].join(', ') || '(none found)'}`);
log(`Source files:    ${sourceFiles.length} *.php file(s) scanned`);
log(`Keys referenced: ${usedKeys.size}`);
if (dynamicPrefixes.size) {
    log('');
    log('Dynamically-built keys found (verify these branches by hand):');
    for (const d of dynamicPrefixes) {
        const [prefix, rest] = d.split(' (');
        log(`  • ${prefix}.* (${rest}`);
    }
}
log('');

if (errors.length === 0 && warnings.length === 0) {
    log('✓ All translation files are valid and in sync.');
} else {
    if (errors.length) {
        log(`✗ ${errors.length} error(s):`);
        for (const e of errors) log(`  ✗ ${e}`);
        log('');
    }
    if (warnings.length) {
        log(`⚠ ${warnings.length} warning(s):`);
        for (const w of warnings) log(`  ⚠ ${w}`);
        log('');
    }
}

const shouldFail = errors.length > 0 || (STRICT && warnings.length > 0);
process.exitCode = shouldFail ? 1 : 0;

if (shouldFail) {
    err(`\nverify-translations: FAILED (${errors.length} error(s)${STRICT ? `, ${warnings.length} warning(s) in --strict mode` : ''})`);
} else {
    log('verify-translations: PASSED');
}
