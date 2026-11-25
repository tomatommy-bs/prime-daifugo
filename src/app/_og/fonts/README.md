# Fonts for generated images

Static subsets used only by `next/og` (`opengraph-image`). They are never
served to browsers.

| File | Family | Glyphs | License |
|---|---|---|---|
| `GeistMono-Medium.woff`, `GeistMono-Bold.woff` | [Geist Mono](https://fonts.google.com/specimen/Geist+Mono) | printable ASCII, `ō·∀∈ℙ×≠∎→` | SIL OFL 1.1 |
| `NotoSansJP-Medium.woff`, `NotoSansJP-Bold.woff` | [Noto Sans JP](https://fonts.google.com/noto/specimen/Noto+Sans+JP) | the Japanese copy on the card | SIL OFL 1.1 |

They were fetched from the Google Fonts CSS API with its `text=` parameter, which returns a
subset. To add characters, request the family again with the full character set and replace
the file.
