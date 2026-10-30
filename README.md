# Aaditya Yadav — portfolio

A static HTML, CSS, and JavaScript portfolio for [yadavaaditya.com.np](https://yadavaaditya.com.np). The site has no runtime packages or database. Node.js 20 or later is used only for the production build and repository checks.

## Local use and production build

```sh
npm ci
npm run build
python3 -m http.server 5500 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:5500/`. The build copies only `index.html`, `assets/`, `robots.txt`, and `sitemap.xml` to `dist/`, then writes public contact configuration. It does not publish environment files, documentation, scripts, or tests.

For a simple content/style preview, the source directory can also be served without building. Environment overrides only take effect in the built `dist/` output.

## Repository checks

```sh
npm run check
npm test
npm run build
npm run test:browser
```

The repository check verifies JavaScript syntax, local asset/anchor links, unique IDs, ARIA references, structured data, and required portfolio content. The isolated contact tests cover validation, request shape, loading and duplicate prevention, draft freezing, feedback visibility, HTTP and JSON-level provider rejections, malformed responses, network failures, timeouts, missing configuration, and offline handling. Tests use an explicitly fake DOM and transport; they never send email and do not establish mailbox delivery.

Playwright is a development-only dependency. Browser checks default to installed Google Chrome, start their own local server for `dist/`, and verify 320, 375, 390, 768, 1024, 1440, and 1920px layouts, keyboard disclosures, navigation/history, certificate focus/Escape/backdrop behavior, no-JavaScript fallback, reduced motion, browser errors, and contact UI states. Contact requests are intercepted only within these automated tests. Screenshots of every section at mobile, tablet, and desktop sizes go to ignored `qa-artifacts/` (override with `QA_OUTPUT` or pass an output path to the script). To test the running preview, use `node scripts/browser-check.mjs /tmp/portfolio-live-check http://127.0.0.1:5500`. Keep live-preview screenshots outside the watched repository so Live Server does not reload the page during tests. Section crops suppress the sticky navigation overlay only while capturing the image. The design review preserves comparisons in `qa-artifacts/refinement-before/` and `qa-artifacts/refinement-after/`. For a machine without Chrome, run `npx playwright install chromium` and use `PLAYWRIGHT_CHANNEL=chromium npm run test:browser`. There is no TypeScript configuration or separate lint tool; `npm run check` includes JavaScript syntax validation.

## Contact delivery — Web3Forms

The existing form sends JSON from the browser to Web3Forms' [documented submission endpoint](https://docs.web3forms.com/getting-started/api-reference), without an SDK, framework, or backend. It sends `access_key`, `name`, `email`, `message`, `subject`, and `from_name`. The subject and [sender display name](https://docs.web3forms.com/getting-started/customizations/from-name) use the visitor's name: `Portfolio message from Jane Smith`. Web3Forms uses `email` as the reply address; the recipient is the inbox associated with the supplied access key, not a visitor-controlled field.

The owner-supplied access key is configured in `assets/js/contact-config.js` for both source previews and default builds. Web3Forms explicitly documents this key as [public browser configuration](https://docs.web3forms.com/getting-started/faq), not a private API credential. Do not add passwords, private API keys, or mailbox tokens.

### Configuration

Optionally copy `.env.example` to `.env` and set `WEB3FORMS_ACCESS_KEY`. A process environment value takes precedence over `.env`, which takes precedence over the source default. Rebuild after changing the value; environment files are never copied into `dist/`. Set `WEB3FORMS_ACCESS_KEY` to an empty string to disable form delivery while keeping direct email available.

### Acceptance and feedback

The form clears the draft and announces success only after HTTP **200** with JSON **`success: true`**. HTTP failures and explicit `success: false` preserve the draft and show a generic error with the direct email fallback. Missing, malformed, or ambiguous responses, network errors, and timeouts are reported as unconfirmed because a request may have reached the provider before its response was lost. Provider details are never displayed to visitors.

Validation, loading feedback, duplicate prevention, draft freezing during submission, accessible status/error announcements, and `mailto:aadireg29@gmail.com` are preserved. Web3Forms' own server-side filtering applies; account-specific CAPTCHA or domain restrictions must match the form configuration if enabled.

### Delivery verification

Automated contact tests intercept or replace transport and never send mail. They verify the request contract and UI states, not inbox receipt. Provider acceptance and mailbox receipt are separate checks; a real accepted response does not prove the email reached the expected inbox or that Reply-To is correct.

**Verification — 30 October 2026:** static checks, all 39 unit tests, the production build, and all 16 browser check groups passed. One owner-authorized real submission was attempted from `http://127.0.0.1:5500`. The browser received no readable provider response, the form reported unconfirmed delivery and preserved the draft, and the owner confirmed no email arrived. No retry was made. Subsequent read-only probes encountered CORS/method restrictions; those probes do not establish whether the access key is valid. **Live delivery remains unverified.**

To finish verification, confirm in the Web3Forms account that this key belongs to the intended inbox and that any configured origin/CAPTCHA restrictions match the form. Then verify the documented browser submission can receive HTTP 200 with `success: true`, actual inbox receipt, and the visitor email as Reply-To. If access remains blocked in a normal browser, review the browser network error with Web3Forms support. Do not treat an intercepted test or an unreadable response as successful delivery.

## Deployment

Use the existing domain's static hosting account; this workspace did not contain deployment credentials or hosting configuration.

- Build command: `npm ci && npm run build`
- Publish/output directory: `dist`
- Set `WEB3FORMS_ACCESS_KEY` if the supplied public key needs replacement.
- Deploy the contents of `dist/` at the domain root, keeping the `assets/` paths intact.
- Enable HTTPS and direct alternate domain variants to the canonical `https://yadavaaditya.com.np/`.
- Rebuild after changing contact configuration; a static host cannot inject environment variables into already-built browser code.
- After deployment, check navigation, images, project repositories, form validation, and one real contact submission from the production origin.

The site has no client-side routing requirement or SPA fallback. No deployment was performed automatically. `dist/` is generated and should not be committed when the hosting platform builds from source.

## Content maintenance

Content lives in `index.html`, design tokens and styles in `assets/css/style.css`, navigation/dialog behavior in `assets/js/script.js`, and contact behavior in `assets/js/mail.js`. Preserve all five projects and their verified links. Employer descriptions must remain limited to publicly shareable, verified facts.


## Optional project images

Project overviews share one text layout. Real diagrams and screenshots appear inside the corresponding technical disclosure. `assets/data/project-images.json` is the image manifest: each project has an array of optional local assets with `src`, meaningful `alt`, intrinsic `width` and `height`, caption, and a `wide`, `phone`, or `medium` layout. Kamiyapp and the messaging application retain their existing assets. CarCaddy, Delivery Route Optimizer, and MindBridge have empty arrays because no suitable images are available.

To add an image, place the real asset in `assets/images/` and add its metadata to the matching manifest entry. Run `npm run images` to refresh the source for a Live Server preview. `npm run build` independently renders the production HTML from the manifest, so no frontend framework or runtime fetch is required. Missing, unconfigured, or invalid assets produce no image, media section, gallery, caption, or placeholder. Dimensions reserve space, images load lazily, and a failed browser request removes its figure and any newly empty gallery/section. The generated static images and native project disclosures remain available without JavaScript.

`npm test` includes isolated contact tests and optional-image rendering tests. Browser checks verify all five project disclosures, missing media, successful image loads, and complete/partial image request failures. Automated tests never make real contact submissions.

## MindBridge source review

Reviewed public source at commit `752c4231ff0d611daa4b1b785d0d634bdd41c3a7` on 30 October 2026. This was source inspection; the project backend, saved model, AI responses, and clinical behavior were not executed or validated.

- [Frontend dependencies](https://github.com/aaditya-29/AI-Assisted-Digital-Behavioral-Screening-Mental-Health-Support-Platform/blob/752c4231ff0d611daa4b1b785d0d634bdd41c3a7/frontend/package.json) and [backend dependencies](https://github.com/aaditya-29/AI-Assisted-Digital-Behavioral-Screening-Mental-Health-Support-Platform/blob/752c4231ff0d611daa4b1b785d0d634bdd41c3a7/backend/requirements.txt) support the React, Python/FastAPI, MySQL, scikit-learn, Gemini, and ReportLab stack.
- Questionnaire/session scoring and persistence: `frontend/src/pages/Screening.jsx`, `backend/app/routes/screening.py`, and `backend/app/services/screening_service.py`.
- Interactive cognitive tasks and results: `frontend/src/pages/TaskPlayer.jsx`, `frontend/src/pages/tasks/`, `backend/app/routes/tasks.py`, and `backend/app/services/task_service.py`.
- AI paths: [model inference](https://github.com/aaditya-29/AI-Assisted-Digital-Behavioral-Screening-Mental-Health-Support-Platform/blob/752c4231ff0d611daa4b1b785d0d634bdd41c3a7/backend/app/services/ml_service.py), [Gemini journal analysis](https://github.com/aaditya-29/AI-Assisted-Digital-Behavioral-Screening-Mental-Health-Support-Platform/blob/752c4231ff0d611daa4b1b785d0d634bdd41c3a7/backend/app/services/journal_analysis_service.py), and `recommendation_service.py`. Model and external API configuration are required. Presence of these paths does not establish live AI operation or medical accuracy.
- Professional access checks and PDF generation: [report routes](https://github.com/aaditya-29/AI-Assisted-Digital-Behavioral-Screening-Mental-Health-Support-Platform/blob/752c4231ff0d611daa4b1b785d0d634bdd41c3a7/backend/app/routes/reports.py) and `backend/app/services/report_service.py`. Portfolio copy describes screening and decision support, not medical diagnosis.
- No image assets were found in the source repository. README text diagrams were not turned into screenshots. The portfolio owner later supplied **May 2026** as the project date; it is displayed first in the project list.
- The live URL comes from `.github/workflows/ping.yml`. `https://mindbridge-f0zw.onrender.com/login` returned HTTP 200 and the MindBridge sign-in page during browser inspection. The portfolio labels it **Live site (sign-in)**; authenticated features and AI delivery remain unverified. No account was created or patient information entered.
- README references to a backend test directory and migrations 006/007 were not corroborated by the inspected tree. Those completion/test claims and medical-performance claims were not copied into the portfolio.


## Experience content provenance

On 30 October 2026 the portfolio owner supplied database design, RESTful API design, production incident monitoring, and Java/Spring Boot/Python backend work, then explicitly confirmed that these responsibilities apply to **both** Thermo Fisher positions. The owner subsequently clarified that frontend screen-building for application entities belongs to the internship, while the full-time role may mention an internal project without further detail. The final copy emphasizes internal backend work and production monitoring in the current role, and frontend screens plus database/API design in the internship. No internal project names, architecture, workflows, metrics, teams, or customer details were published. The Infosys entry remains unchanged.


## Project-based technical profile

The skills section preserves Java, Python, and Spring Boot as the primary technologies. Its MindBridge-backed additions are FastAPI (backend/API routes), SQLAlchemy (persistence), scikit-learn inference and Gemini API integration (assisted analysis), and Vite (frontend build tooling). Evidence is in the MindBridge source review above, including actual service code and dependency manifests. These describe project implementation experience, not model-training expertise, clinical validation, or an employer's internal stack. Project-specific dependencies such as Axios, joblib, and ReportLab remain in project details rather than expanding the skills list.
