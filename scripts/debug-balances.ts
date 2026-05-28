import * as fs from 'fs';
import * as path from 'path';

const resultsDir = path.resolve('./runtime/worker-01/results');
const files = fs.readdirSync(resultsDir);

// Sort files by mtime desc
const sortedFiles = files
  .map(f => ({ name: f, time: fs.statSync(path.join(resultsDir, f)).mtimeMs }))
  .sort((a, b) => b.time - a.time);

console.log("Latest 10 result files:");
sortedFiles.slice(0, 10).forEach(file => {
  const content = fs.readFileSync(path.join(resultsDir, file.name), 'utf-8');
  console.log(`\nFile: ${file.name} (Time: ${new Date(file.time).toISOString()})`);
  console.log(content);
});
