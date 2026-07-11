# Green Meteor Website Translations

Thank you for your interest in helping translate the Green Meteor website! ❤️

Community translations help make Green Meteor accessible to users around the world. Every contribution, no matter how small, is appreciated.

## Getting Started

Each language has its own directory inside the `locals` folder.

Translations **must** follow this directory structure:

```text
locals/
├── en/
│   └── messages.json
├── de/
│   └── messages.json
├── fr/
│   └── messages.json
└── ...
```

The required format is:

```text
/locals/{lang}/messages.json
```

Where:

* `{lang}` is the language code (for example: `en`, `de`, `fr`, `es`, `ja`, etc.)
* `messages.json` contains all translated strings for that language.

## Creating a New Translation

1. Create a new folder using your language code.
2. Add a `messages.json` file inside that folder.
3. Translate all values while keeping the JSON structure and keys unchanged.
4. Submit a Pull Request.

## Need Help?

If you're unsure how to format your translation, simply use one of the existing language files as a template. They provide the correct structure and formatting expected by the project.

Please do **not**:

* Rename translation keys.
* Remove existing keys.
* Change the JSON structure.
* Translate placeholder names (such as `{name}` or `{count}`) unless their surrounding text requires grammatical changes.

## Translation Tips

* Use natural wording instead of literal word-for-word translations.
* Keep terminology consistent throughout the file.
* Preserve punctuation where appropriate.
* Verify that the JSON remains valid before submitting.

## Contributing

1. Fork this repository.
2. Create your translation or update an existing one.
3. Commit your changes.
4. Open a Pull Request describing your contribution.

Every translation helps make Green Meteor available to more people around the world.

Thank you for contributing! 🌍
