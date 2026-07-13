#!/usr/bin/env node
/**
 * verify-translations.js
 * ---------------------------------------------------------------------------
 * Verifies that every translation file under /locals follows the structure
 * expected by OnigiriJS.
 *
 * Checks performed:
 *   1. Every translation file is valid JSON.
 *   2. Every locale contains the same label files as the base locale.
 *   3. Every locale contains the same translation keys as the base locale.
 *   4. (Warning only) Reports extra locale-only files.
 *   5. (Warning only) Reports extra locale-only keys.
 *
 * Usage:
 *   node scripts/verify-translations.js
 *   node scripts/verify-translations.js --strict
 *
 * In --strict mode, warnings also fail the build.
 * ---------------------------------------------------------------------------
 */

'use strict';

const fs = require('fs');
const path = require('path');

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const REPO_ROOT = process.cwd();
const LOCALS_DIR = path.join(REPO_ROOT, 'locals');

const BASE_LOCALE = 'en';
const LOCALES = ['en', 'ja', 'de'];

const STRICT = process.argv.includes('--strict');

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function log(message) {
    process.stdout.write(message + '\n');
}

function err(message) {
    process.stderr.write(message + '\n');
}

/**
 * Flatten nested JSON into dot notation.
 *
 * Example:
 * {
 *   "nav": {
 *     "home": "Home"
 *   }
 * }
 *
 * becomes:
 *
 * {
 *   "nav.home": "Home"
 * }
 */
function flatten(obj, prefix = '', out = {}) {
    for (const [key, value] of Object.entries(obj)) {
        const next = prefix ? `${prefix}.${key}` : key;

        if (
            value !== null &&
            typeof value === 'object' &&
            !Array.isArray(value)
        ) {
            flatten(value, next, out);
        } else {
            out[next] = value;
        }
    }

    return out;
}

// -----------------------------------------------------------------------------
// Begin verification
// -----------------------------------------------------------------------------

if (!fs.existsSync(LOCALS_DIR)) {
    err(`✗ Could not find "${LOCALS_DIR}"`);
    process.exit(1);
}

const errors = [];
const warnings = [];

// -----------------------------------------------------------------------------
// Discover label files
// -----------------------------------------------------------------------------

const labelsByLocale = {};

for (const locale of LOCALES) {
    const localeDir = path.join(LOCALS_DIR, locale);

    if (!fs.existsSync(localeDir)) {
        errors.push(`Missing locale directory: locals/${locale}/`);
        labelsByLocale[locale] = [];
        continue;
    }

    labelsByLocale[locale] = fs
        .readdirSync(localeDir)
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace(/\.json$/, ''))
        .sort();
}

const baseLabels = new Set(labelsByLocale[BASE_LOCALE] || []);

if (baseLabels.size === 0) {
    errors.push(
        `Base locale "${BASE_LOCALE}" contains no JSON translation files.`
    );
}

// -----------------------------------------------------------------------------
// Compare label files
// -----------------------------------------------------------------------------

for (const locale of LOCALES) {
    if (locale === BASE_LOCALE) {
        continue;
    }

    const localeLabels = new Set(labelsByLocale[locale] || []);

    for (const label of baseLabels) {
        if (!localeLabels.has(label)) {
            errors.push(
                `locals/${locale}/${label}.json is missing (exists in ${BASE_LOCALE})`
            );
        }
    }

    for (const label of localeLabels) {
        if (!baseLabels.has(label)) {
            warnings.push(
                `locals/${locale}/${label}.json has no matching file in ${BASE_LOCALE}`
            );
        }
    }
}

// -----------------------------------------------------------------------------
// Parse every translation file
// -----------------------------------------------------------------------------

const translations = {};

for (const locale of LOCALES) {
    translations[locale] = {};

    for (const label of labelsByLocale[locale] || []) {
        const file = path.join(LOCALS_DIR, locale, `${label}.json`);

        try {
            const json = JSON.parse(fs.readFileSync(file, 'utf8'));

            translations[locale][label] = flatten(json);

        } catch (e) {

            errors.push(
                `Invalid JSON in locals/${locale}/${label}.json\n  ${e.message}`
            );

            translations[locale][label] = {};
        }
    }
}

// -----------------------------------------------------------------------------
// Compare translation keys
// -----------------------------------------------------------------------------

for (const label of baseLabels) {

    const baseKeys = new Set(
        Object.keys(translations[BASE_LOCALE][label] || {})
    );

    for (const locale of LOCALES) {

        if (locale === BASE_LOCALE) {
            continue;
        }

        const localeKeys = new Set(
            Object.keys(translations[locale][label] || {})
        );

        const missing = [...baseKeys].filter(
            key => !localeKeys.has(key)
        );

        const extra = [...localeKeys].filter(
            key => !baseKeys.has(key)
        );

        for (const key of missing) {
            errors.push(
                `[${locale}/${label}.json] Missing key "${key}"`
            );
        }

        for (const key of extra) {
            warnings.push(
                `[${locale}/${label}.json] Extra key "${key}"`
            );
        }
    }
}

// -----------------------------------------------------------------------------
// Report
// -----------------------------------------------------------------------------

log('');
log('OnigiriJS Translation Verification');
log('=================================');
log(`Base locale : ${BASE_LOCALE}`);
log(`Locales     : ${LOCALES.join(', ')}`);
log(`Label files : ${[...baseLabels].join(', ') || '(none)'}`);
log('');

if (errors.length === 0 && warnings.length === 0) {

    log('✓ All translation files are valid and synchronized.');

} else {

    if (errors.length) {

        log(`✗ ${errors.length} error(s):`);

        for (const error of errors) {
            log(`  ✗ ${error}`);
        }

        log('');
    }

    if (warnings.length) {

        log(`⚠ ${warnings.length} warning(s):`);

        for (const warning of warnings) {
            log(`  ⚠ ${warning}`);
        }

        log('');
    }
}

const failed =
    errors.length > 0 ||
    (STRICT && warnings.length > 0);

process.exitCode = failed ? 1 : 0;

if (failed) {

    err(
        `verify-translations: FAILED (${errors.length} error(s)${
            STRICT ? `, ${warnings.length} warning(s) in --strict mode` : ''
        })`
    );

} else {

    log('verify-translations: PASSED');

}
