import {chromium as browserType} from 'playwright';
// CI uses Playwright's pinned browser; Cloud may supply a system Chromium.
export const chromium={launch:options=>browserType.launch({...options,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})})};
