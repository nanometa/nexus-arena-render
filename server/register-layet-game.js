const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const rootDir = path.resolve(__dirname, '..');
const layetDir = path.join(rootDir, 'src', 'LayetGame');
const previousLoader = require.extensions['.js'];

require.extensions['.js'] = function loadLayetModule(module, filename) {
  if (!filename.startsWith(layetDir)) {
    return previousLoader(module, filename);
  }

  const source = fs.readFileSync(filename, 'utf8');
  const result = babel.transformSync(source, {
    filename,
    babelrc: false,
    configFile: false,
    presets: [
      [
        require.resolve('@babel/preset-env'),
        {
          targets: { node: 'current' },
        },
      ],
    ],
    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
  });

  module._compile(result.code, filename);
};
