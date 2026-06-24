// jest-dom adds custom jest matchers for asserting on DOM nodes
// (e.g. expect(element).toHaveTextContent(/react/i)).
//
// It is loaded here ONLY if available. The previous line
//   import '@testing-library/jest-dom/extend-expect';
// used a subpath removed in jest-dom v6+, and the package is not installed,
// which made *every* test fail to run. The pure local-demo engine tests do not
// need DOM matchers, so we load jest-dom opportunistically and ignore its absence.
try {
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  require('@testing-library/jest-dom');
} catch (e) {
  // jest-dom is optional; ignore if it is not installed.
}
