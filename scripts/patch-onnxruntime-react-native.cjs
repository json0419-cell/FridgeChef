const fs = require('fs');
const path = require('path');

const cmakePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'onnxruntime-react-native',
  'android',
  'CMakeLists.txt',
);

if (!fs.existsSync(cmakePath)) {
  process.exit(0);
}

const text = fs.readFileSync(cmakePath, 'utf8');
const linkerFlag = 'target_link_options(onnxruntimejsi PRIVATE "-Wl,-z,max-page-size=16384")';

if (text.includes(linkerFlag)) {
  process.exit(0);
}

fs.writeFileSync(cmakePath, `${text.trimEnd()}\n\n${linkerFlag}\n`);
