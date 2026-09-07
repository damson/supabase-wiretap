# Social preview

`preview.png` is the card GitHub shows when this repository is linked from
anywhere else, and the banner at the top of the main README. It is 1280x640,
which is the size GitHub crops from.

Uploading it is a manual step, because there is no REST endpoint for the social
preview: **Settings > General > Social preview > Upload an image.** The README
picks the file up from here automatically.

## Re-rendering it

`card.html` is the source. It is self-contained apart from its webfonts, so
editing the wording is editing that file:

```sh
python3 -m http.server 8080 --directory .github/social-preview
# then screenshot the page at exactly 1280x640, no device scaling
```

Any headless browser will do it. The card is sized in CSS pixels, so capture at
a device pixel ratio of 1 and the output is 1280x640 with no resampling.

## Why it looks like an evidence tag

The package records calls so a test can assert on them. It produces evidence,
so the card is the label evidence arrives under: card stock, typed fields, a
punched hole, and no screen chrome anywhere. The fields are the package's actual
claims rather than decoration, which is also why they are worth keeping accurate
if the behaviour changes.
