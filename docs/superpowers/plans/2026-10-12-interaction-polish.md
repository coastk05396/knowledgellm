# Interaction polish verification

Implements the button feedback and toast lifecycle requirements in `PROMTS.md`.
The branch starts at `origin/main` commit `36e68718cabf6601c2b1f77001329c9c48bf571e`;
the prior hybrid-search branch's commits are excluded.

## Validation

- `rtk env NODE_OPTIONS=--no-experimental-webstorage npm test` in `web/`: 62 tests passed. Without this environment option, this Node installation's experimental storage breaks existing workspace tests.
- `rtk env PYTHONPATH=/tmp/knowledgellm-polish-api-deps python3.12 -m pytest` in `api/`: 167 tests passed. Dependencies were installed from `.[dev]` into an isolated temporary directory because the checkout's virtual environment lacks pytest.
- `rtk npm run build`: type checking and Vite production build passed.
- `rtk npm run format:check`: passed; the added toast tests were subsequently formatted with Prettier.
- `rtk npm audit --audit-level=high`: zero vulnerabilities.
- `rtk git diff --check`: passed.
- Local Chromium/Playwright: no signed-out horizontal overflow at 320, 390, 768, or 1440 px; pointer press computed scale 0.985; keyboard Space activation computed transform none; hover background unchanged with a coarse touch pointer; toast computed transitions 180ms entering and 140ms closing, or 80ms opacity only with reduced motion. No page errors observed.
- Regression tests cover manual and automatic dismissal, repeated clicks, cleanup on unmount, notification replacement, reduced-motion exit timing, and callback changes without lifetime extension.

## Screenshots and limits

[Desktop with toast](2026-10-12-interaction-polish/desktop-toast.png) and
[mobile signed-out layout](2026-10-12-interaction-polish/mobile.png) were captured
and visually inspected. The desktop toast is the actual component mounted with
synthetic props for local verification; it does not establish successful live
Cognito authentication. The mobile screenshot uses Chromium touch emulation.
Real-phone touch, keyboard, and safe-area behavior remain unverified.

## Self-review and shipping decision

Self-review covered correctness, cleanup, repeated dismissal/replacement,
keyboard focus, reduced motion, hover gating, and motion interruption. No blocking
findings remain. Toast motion uses interruptible opacity/transform transitions;
no dependencies or backend behavior changed. The conditional viewport/safe-area
proposal is deferred because edge-to-edge or installed-phone use is not an
established product target.

Ready for PR review. Merge, deployment, and public authenticated smoke tests have
not been performed. Roll back by reverting the polish commit and rebuilding the
frontend using its existing release process; no data or infrastructure migration
is needed. After release, verify persona sign-in, manual/automatic toast dismissal,
keyboard focus, pointer feedback, and reduced motion on the public frontend.
