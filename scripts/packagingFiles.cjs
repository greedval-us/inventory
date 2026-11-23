function rendererFiles(from) {
  return {
    from,
    to: 'build/renderer',
    filter: ['index.html', 'assets/*.{js,css}', 'fonts/*.ttf', 'fonts/*-{OFL,NOTICE}.txt'],
  };
}

const excludeDependencyMetadata = '!node_modules/**/{*.map,.nycrc,.editorconfig,.eslintignore,tsconfig.json}';

module.exports = { rendererFiles, excludeDependencyMetadata };
