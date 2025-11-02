const chromium = require('@sparticuz/chromium');
const puppeteerCore = require('puppeteer-core');

async function test() {
  console.log('Testing chromium setup...');
  
  try {
    console.log('1. Getting executable path...');
    const executablePath = await chromium.executablePath();
    console.log('   Path:', executablePath);
    
    console.log('2. Checking if path exists...');
    const fs = require('fs');
    const exists = fs.existsSync(executablePath);
    console.log('   Exists:', exists);
    
    console.log('3. Chromium args:', chromium.args);
    
    console.log('4. Trying to launch...');
    const browser = await puppeteerCore.launch({
      headless: true,
      args: chromium.args,
      executablePath
    });
    
    console.log('5. SUCCESS! Browser launched');
    await browser.close();
    
  } catch (error) {
    console.error('ERROR:', error.message);
    console.error('Stack:', error.stack);
  }
}

test();
