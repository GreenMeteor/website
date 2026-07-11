# Green Meteor Website Translations

Welcome to the Green Meteor Website Translations repository!

This repository contains the translation files used by the Green Meteor website. Community contributions are always welcome and help make Green Meteor available to users around the world.

## Translation Structure

Each language must be placed in its own directory using its ISO language code.

The required directory structure is:

```text
/locals/{lang}/messages.json
```

Examples:

```text
locals/
├── en/
│   └── messages.json
├── de/
│   └── messages.json
├── fr/
│   └── messages.json
└── ja/
    └── messages.json
```

Where:

* `{lang}` is the language code (such as `en`, `de`, `fr`, `es`, `it`, `ja`, etc.).
* `messages.json` contains all translated strings for that language.

## Creating a Translation

1. Create a new folder inside `locals` using your language code.
2. Copy the English `messages.json` into your new folder.
3. Translate **only the text values**.
4. Keep the JSON structure exactly the same.
5. Submit a Pull Request.

## Translation Guidelines

When translating:

* Keep all JSON keys exactly as they are.
* Translate **only** the string values.
* Do not rename, remove, or add keys unless they have been added to the English source.
* Preserve valid JSON formatting.
* Use UTF-8 encoding.
* Keep capitalization and punctuation appropriate for your language.

## Need Help?

If you're unsure how to format your translation, use one of the existing translations as a template. Every language follows the same structure, making it easy to compare files and ensure everything is formatted correctly.

The English translation (`locals/en/messages.json`) is always the source of truth and should be used as the reference for new translations.

## Submitting Changes

1. Fork this repository.
2. Create a new branch.
3. Add or update your translation.
4. Commit your changes.
5. Open a Pull Request.

Thank you for helping make Green Meteor more accessible to users around the world! 🌍
