import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import puppeteer, { Browser, Page } from 'puppeteer';

// Set explicit timeout for the entire operation
const GLOBAL_TIMEOUT = 45000; // 45 seconds total timeout

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Start timer for global timeout
  const startTime = Date.now();
  let browser = null;

  try {
    const { category, model } = req.body;

    if (!category || !model) {
      return res.status(400).json({ error: 'Missing category or model parameter' });
    }

    // Launch a browser to render the ring and take a screenshot
    console.log(`Generating thumbnail for ${category}/${model}...`);

    // Ensure the images directory exists first (do this early)
    const imagesDir = path.join(process.cwd(), 'public', 'images', category);
    fs.mkdirSync(imagesDir, { recursive: true });

    // Attempt to generate the thumbnail
    try {
      // Create browser instance with enhanced socket connection handling
      console.log("Launching Puppeteer browser...");
      browser = await puppeteer.launch({
        headless: "new", // Use new headless mode
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process', // Fix for frame detachment
          '--no-first-run',
          '--no-zygote'
        ],
        timeout: 30000, // Lower timeout for browser launch
        protocolTimeout: 30000 // Protocol timeout to avoid socket hangups
      });

      let page: Page | null = null;
      let screenshotBuffer = null;
      
      try {
        // Create new page with error handling
        console.log("Creating new page...");
        page = await browser.newPage();
        
        // Set timeouts
        page.setDefaultNavigationTimeout(20000); // 20 seconds navigation timeout
        page.setDefaultTimeout(15000); // 15 seconds for other operations
        
        // Prevent common causes of socket hangups
        await page.setCacheEnabled(false);
        
        // Set small viewport for faster rendering
        await page.setViewport({ width: 600, height: 600 });
        
        // Set up page-level timeout that will force completion
        const pageTimeout = setTimeout(() => {
          console.log("Page timeout reached, forcing completion");
          if (page && !page.isClosed()) {
            try {
              page.close().catch(() => {});
            } catch (e) {
              console.error("Error closing page on timeout:", e);
            }
          }
        }, 30000);
        
        // Navigate with basic error handling and simpler approach
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
        const url = `${baseUrl}/render/${category}?model=${model}`;
        console.log(`Navigating to: ${url}`);
        
        try {
          // Use simpler navigation approach with just domcontentloaded
          await page.goto(url, { 
            waitUntil: 'domcontentloaded', 
            timeout: 20000 
          });
          console.log("Navigation completed");
        } catch (navError) {
          console.error("Navigation error:", navError);
          // If we had a navigation error, we might still be able to capture a screenshot
          console.log("Trying to proceed despite navigation error");
        }
        
        // Wait a fixed time rather than trying to detect readiness
        console.log("Waiting fixed time for rendering...");
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Check if browser and page are still valid
        if (browser && browser.isConnected() && page && !page.isClosed()) {
          try {
            // Simplify screenshot approach
            console.log("Taking screenshot...");
            screenshotBuffer = await page.screenshot({ 
              type: 'png',
              omitBackground: true,
              fullPage: false
            });
            console.log("Screenshot captured");
          } catch (screenshotError) {
            console.error("Screenshot error:", screenshotError);
            // If we can't take a screenshot, it's a fatal error
            throw screenshotError;
          }
        } else {
          throw new Error("Browser or page no longer valid before screenshot");
        }
        
        // Clear the timeout
        clearTimeout(pageTimeout);
      } finally {
        // Always make sure to close the page to avoid resource leaks
        if (page && !page.isClosed()) {
          try {
            await page.close();
            console.log("Page closed");
          } catch (pageCloseError) {
            console.error("Error closing page:", pageCloseError);
          }
        }
      }
      
      // Always try to close the browser in a finally block
      if (browser && browser.isConnected()) {
        try {
          await browser.close();
          console.log("Browser closed");
        } catch (browserCloseError) {
          console.error("Error closing browser:", browserCloseError);
        }
      }
      
      // Set browser to null to avoid trying to close it again in the outer finally block
      browser = null;
      
      // Handle screenshot failure
      if (!screenshotBuffer) {
        throw new Error("Failed to capture screenshot - buffer is empty");
      }
      
      // Save the screenshot
      const thumbnailPath = path.join(imagesDir, `${model}.png`);
      fs.writeFileSync(thumbnailPath, screenshotBuffer);
      console.log(`Thumbnail saved to ${thumbnailPath}`);
      
      // Check if we exceeded global timeout
      if (Date.now() - startTime > GLOBAL_TIMEOUT) {
        console.warn("Operation completed but exceeded global timeout");
      }
      
      return res.status(200).json({ 
        success: true, 
        message: `Thumbnail generated for ${category}/${model}`,
        path: `/images/${category}/${model}.png`
      });
    } catch (error) {
      console.error('Error generating thumbnail:', error);
      return res.status(500).json({ 
        error: 'Failed to generate thumbnail', 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  } catch (error) {
    console.error('Error in thumbnail generation API:', error);
    res.status(500).json({ error: 'Error generating thumbnail' });
  } finally {
    // Final browser cleanup in case it wasn't closed earlier
    if (browser && browser.isConnected()) {
      try {
        await browser.close();
        console.log("Browser closed in final cleanup");
      } catch (finalCleanupError) {
        console.error("Error in final browser cleanup:", finalCleanupError);
      }
    }
    
    // Force garbage collection if possible (Node.js with --expose-gc flag)
    if (global.gc) {
      try {
        global.gc();
      } catch (e) {
        // Ignore errors from forced GC
      }
    }
  }
}

// Cleanup function to handle potential zombie Chrome processes
// This will only run in production environments
if (process.env.NODE_ENV === 'production') {
  const cleanupChromeProcesses = async () => {
    try {
      // Only run on server
      if (typeof window === 'undefined') {
        const { exec } = require('child_process');
        
        // Find orphaned Chrome processes
        exec('ps aux | grep chrome-headless | grep -v grep', (error: Error, stdout: string) => {
          if (stdout) {
            console.log('Found potential zombie Chrome processes, attempting cleanup...');
            
            // Kill zombie processes
            exec('pkill -f chrome-headless', (killError: Error) => {
              if (killError) {
                console.log('No Chrome processes to clean up');
              } else {
                console.log('Successfully cleaned up Chrome processes');
              }
            });
          }
        });
      }
    } catch (e) {
      console.error('Error in Chrome process cleanup:', e);
    }
  };

  // Run cleanup periodically
  setInterval(cleanupChromeProcesses, 300000); // Run every 5 minutes
} 