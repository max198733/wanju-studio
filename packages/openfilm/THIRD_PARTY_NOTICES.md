# Third-party notices

Studio's editor (`studio/ui/dist`) bundles:

- **Inter** by Rasmus Andersson, via `@fontsource-variable/inter`: SIL Open Font License 1.1
  (https://openfontlicense.org).
- **React** and **React DOM**: MIT License, © Meta Platforms, Inc. and affiliates.
- **Lucide** icons (`lucide-react`): ISC License, © Lucide Contributors.

The CLI depends on **playwright-core** (Apache License 2.0), which downloads a headless Chromium on first use.

Document import uses **Mammoth** (BSD-2-Clause, Michael Williamson) for DOCX and **PDF.js**
(`pdfjs-dist`, Apache License 2.0, Mozilla Foundation) for PDF text extraction.
PDF.js's optional Node canvas renderer is not used for text extraction.

The code-animation style catalog in `skills-extra/` is a mixed-source collection, not a single MIT work. It retains
the collection's free-sharing and attribution terms in `skills-extra/THIRD_PARTY/`, plus the separate MIT notices for
Lemo-Opuscar, mg-styles-15 and code-video. Do not sell this collection as a paid course or paid skill pack.
