# Owner guide videos (reusable for every client)

- `app.html`: LeadConnector-style phone mockup + one scripted scene per video (`scripts` object, keyed by slug). Edit names/numbers/stages for the client (Cruz values are hard-coded: business 616-344-5421, Jobs Pipeline stages, logo.png).
- `rec.py`: `python3 rec.py slug1,slug2 video` records 780x1848 MP4s with Playwright (needs `logo.png` next to app.html). `python3 rec.py slug stills 3,7` saves preview JPGs.
- `desktop-slides.py`: builds the Facebook/Instagram desktop tutorial from real GHL screenshots (dash.jpg, settings.jpg, integ.jpg) with highlight boxes and captions.
- Output goes to `public/videos/owner/<slug>.mp4` + a mid-video poster `<slug>.jpg`.

See the SOP: dotcommatrix360/local-growth-accelerator-sop → 10-owner-guide.md.
