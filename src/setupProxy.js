/**
 * Dev-only static serving of the repo-root `assets/` folder at the `/assets` URL.
 *
 * Why: the card artworks live in `D:\LAYET VM\assets\cards\artworks\*.png`, OUTSIDE CRA's
 * `public/` directory, so the browser cannot fetch them by default. This middleware lets the
 * dev server (`npm start`) serve them straight from where they already are — WITHOUT moving,
 * copying, renaming or modifying any asset (the visuals are owned by another agent).
 *
 * Scope: this file is used ONLY by the CRA dev server (react-scripts auto-detects
 * `src/setupProxy.js`). It is NOT bundled by `npm run build`; in production the GameCard CSS
 * fallbacks are used until `assets/` is served by the host. No new dependency is required
 * (the dev server's Express `app` provides `res.sendFile`).
 */
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.resolve(__dirname, '..', 'assets');

module.exports = function (app) {
  app.use('/assets', (req, res, next) => {
    const rel = decodeURIComponent(req.path).replace(/^[\\/]+/, '');
    const target = path.resolve(ASSETS_DIR, rel);

    // Path-traversal guard: the resolved path must stay inside ASSETS_DIR.
    if (target !== ASSETS_DIR && !target.startsWith(ASSETS_DIR + path.sep)) {
      res.status(403).end();
      return;
    }

    fs.stat(target, (err, stat) => {
      if (err || !stat.isFile()) {
        next(); // not found here -> let the dev server handle it (404)
        return;
      }
      res.sendFile(target);
    });
  });
};
