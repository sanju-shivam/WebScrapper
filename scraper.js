import puppeteer from "puppeteer";

function getTimeFilter(hoursOrDays) {
  const hours = hoursOrDays <= 24 ? hoursOrDays : hoursOrDays * 24;
  return `r${hours * 3600}`;
}

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

export async function scrapeLinkedInJobs({ role, location, hoursOrDays }) {
  const browser = await puppeteer.launch({ 
    headless: true, // Run in background
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ]
  });
  
  const page = await browser.newPage();
  
  // Set viewport and additional headers
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
  });

  // Mask webdriver property
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });
  });

  // Suppress browser console logs for cleaner output
  // page.on("console", (msg) => console.log("BROWSER LOG:", msg.text()));

  let searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(
    role
  )}&f_TPR=${getTimeFilter(hoursOrDays)}`;

  if (location) searchUrl += `&location=${encodeURIComponent(location)}`;

  console.log(`🔍 Scraping LinkedIn jobs...`,searchUrl);
  await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 60000 });
  await delay(3000);

  // Remove overlays and modals
  await page.evaluate(() => {
    const selectorsToRemove = [
      ".modal__overlay",
      ".sign-in-modal__overlay",
      ".contextual-sign-in-modal__overlay",
      "[data-test-modal]",
      ".artdeco-modal-overlay"
    ];
    selectorsToRemove.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => el.remove());
    });
    
    // Remove overflow hidden from body
    document.body.style.overflow = 'auto';
  });
  
  await delay(2000);

  // Wait for job listings to appear - try multiple selectors
  const possibleSelectors = [
    "ul.scaffold-layout__list-container",
    "ul.jobs-search__results-list",
    ".jobs-search-results__list",
    ".jobs-search-results-list"
  ];

  let jobsContainer = null;
  for (const selector of possibleSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      jobsContainer = await page.$(selector);
      if (jobsContainer) {
        break;
      }
    } catch (e) {
      // Silently try next selector
    }
  }

  if (!jobsContainer) {
    // Silently handle - will try window scroll as fallback
  }

  // Scroll to load more jobs
  if (jobsContainer) {
    for (let i = 0; i < 5; i++) {
      await page.evaluate(el => {
        el.scrollTop = el.scrollHeight;
      }, jobsContainer);
      await delay(1500);
    }
  } else {
    // Fallback: scroll the window
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, 800));
      await delay(1500);
    }
  }

  // Extract jobs with multiple selector strategies
  const jobs = await page.evaluate(() => {
    // Try multiple card selectors
    const cardSelectors = [
      "li.jobs-search-results__list-item",
      "li.scaffold-layout__list-item",
      "div.job-search-card",
      "div.base-card"
    ];

    let jobCards = [];
    for (const selector of cardSelectors) {
      jobCards = document.querySelectorAll(selector);
      if (jobCards.length > 0) {
        console.log(`Found ${jobCards.length} cards with selector: ${selector}`);
        break;
      }
    }

    if (jobCards.length === 0) {
      console.log("No job cards found with any selector");
      return [];
    }

    return Array.from(jobCards).slice(0, 15).map(card => {
      // Try multiple selector variations for each field
      const title = 
        card.querySelector("h3.base-search-card__title")?.innerText?.trim() ||
        card.querySelector(".base-card__full-link")?.innerText?.trim() ||
        card.querySelector("a.job-card-list__title")?.innerText?.trim() ||
        "N/A";

      const company = 
        card.querySelector("h4.base-search-card__subtitle")?.innerText?.trim() ||
        card.querySelector(".base-search-card__subtitle a")?.innerText?.trim() ||
        card.querySelector(".job-card-container__company-name")?.innerText?.trim() ||
        "N/A";

      const location = 
        card.querySelector(".job-search-card__location")?.innerText?.trim() ||
        card.querySelector(".job-card-container__metadata-item")?.innerText?.trim() ||
        "N/A";

      const link = 
        card.querySelector("a.base-card__full-link")?.href ||
        card.querySelector("a[href*='/jobs/view/']")?.href ||
        card.querySelector("a")?.href ||
        "N/A";

      const posted = 
        card.querySelector("time")?.innerText?.trim() ||
        card.querySelector(".job-search-card__listdate")?.innerText?.trim() ||
        "N/A";

      return { title, company, location, posted, link };
    }).filter(job => job.title !== "N/A" && job.link !== "N/A"); // Filter out invalid entries
  });

  await browser.close();
  
  // Return clean JSON result
  return {
    success: jobs.length > 0,
    count: jobs.length,
    query: { role, location, hoursOrDays },
    jobs: jobs
  };
}

// Example call
scrapeLinkedInJobs({ role: "Brand Manager", location: "India", hoursOrDays: 1 })
  .then(result => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(err => {
    console.error(JSON.stringify({
      success: false,
      error: err.message
    }, null, 2));
  });