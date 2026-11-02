# Testimonials

`testimonials.json` holds **real** reviews only, each with its source and the client's permission:

```json
[
  {
    "id": "jane-d-2026-03",
    "quote": "Exact words from the review.",
    "author": "Jane D.",
    "location": "Boise",
    "source": "google",
    "sourceUrl": "https://g.page/…",
    "date": "2026-03-14",
    "permission": true
  }
]
```

The schema rejects entries without `source` or `permission: true`. Never write, paraphrase into new claims,
or "improve" a review. Leave the array empty until the client supplies real ones — the section then hides.
