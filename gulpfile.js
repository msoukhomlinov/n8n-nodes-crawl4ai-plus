const { src, dest, task } = require('gulp');

// Copy SVG files to the dist folder
function copyIcons() {
  return src('nodes/**/*.svg')
    .pipe(dest('dist/nodes/'));
}

// Define build:icons task
task('build:icons', copyIcons);

// Define default task
exports.default = copyIcons;
