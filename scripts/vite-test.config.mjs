import path from 'node:path';
const port=Number(process.env.TIDEHOLD_TEST_PORT||5187);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid isolated test port.');
export default {
  root:process.cwd(),cacheDir:path.resolve('artifacts','vite-test-cache',String(port)),
  // Concurrent test servers must not overwrite one another's optimized Three
  // modules or scan frozen copies, generated reports and packaged game HTML.
  optimizeDeps:{entries:['index.html']},
  server:{host:'127.0.0.1',port,strictPort:true,watch:{ignored:['**/artifacts/**','**/release/**','**/test-results/**','**/playwright-report/**']}},
};
