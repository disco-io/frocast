# Test bar: score the topping photo check

Synthetic topping-bar photos with a known answer key, plus a script that scores the photo check against them. The six demo bins (`js/demo-data.js`) are drawn in 3D perspective, with steel pans, toppings at known fill levels, counter, light and grain, and no text labels. Bad photos are included too: glare, blur, too dark, a column cut off, and a hand in frame.

```bash
npm start                              # another terminal; needs ANTHROPIC_API_KEY in .env and TOPPING_CAMERA=1
node tools/testbar/generate.mjs 24 7   # 24 clean + 6 bad photos, seed 7 -> tools/testbar/out/ (git-ignored)
node tools/testbar/eval.mjs            # scores them through /api/vision -> tools/testbar/results/latest.md
```

- JPEG rendering uses macOS's built-in `qlmanage` and `sips`. On other systems you get SVGs; convert them to JPEG first.
- The scorer uses the demo bins, then resets the demo data so the stored test photos are removed. Pass `--keep` to keep them.
- Cost: one Claude call per photo (`claude-haiku-5-5`), a few cents for 30.
- These are synthetic images. They catch regressions and compare prompt changes; photos of the real bar are the real test.
