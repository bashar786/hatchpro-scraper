
const puppeteer = require('puppeteer');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const urls = [
  {
    name: "Living",
    "url": "https://www.dovetailhome.com/living/?listing=True&p=1&c=1073741835__CatalogContent&sort=Newest"
  },
  {
    name: "Dining",
    "url": "https://www.dovetailhome.com/dining/?listing=True&p=1&c=1073741847__CatalogContent&sort=Newest"
  },
  {
    name: "Bedroom",
    "url": "https://www.dovetailhome.com/bedroom/?listing=True&p=1&c=1073741858__CatalogContent&sort=Newest"
  },
  {
    name: "Outdoor",
    "url": "https://www.dovetailhome.com/outdoor/?listing=True&p=1&c=1073741865__CatalogContent&sort=Newest"
  },
  {
    name: "Lighting & Decor",
    "url": "https://www.dovetailhome.com/lightingdecor/?listing=True&p=1&c=1073741866__CatalogContent&sort=Newest"
  },
  {
    name: "One of a Kind",
    "url": "https://www.dovetailhome.com/one-of-a-kind/?listing=True&p=1&c=1073741874__CatalogContent&sort=Newest"
  },
  {
    name: "Sale",
    "url": "https://www.dovetailhome.com/sale/?listing=True&p=1&c=1073741885__CatalogContent&sort=Newest"
  },
  {
    name: "Closeouts",
    "url": "https://www.dovetailhome.com/closeouts/?listing=True&p=1&c=1073741886__CatalogContent&sort=Newest"
  },
  {
    name: "New Introductions",
    "url": "https://www.dovetailhome.com/new-introductions/?listing=True&p=1&c=1073741834__CatalogContent&sort=Newest"
  }

];

const scrollAndExtractProducts = async (page, productSelector) => {
  let previousHeight;
  const products = new Set();

  while (true) {
    const newProducts = await page.evaluate((selector) => {
      const anchors = Array.from(document.querySelectorAll(selector));
      return anchors.map(anchor => anchor.href);
    }, productSelector);

    newProducts.forEach(product => products.add(product));

    // Scroll down the page
    previousHeight = await page.evaluate('document.body.scrollHeight');
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await sleep(3000); // Adjust sleep time as necessary

    const newHeight = await page.evaluate('document.body.scrollHeight');
    if (newHeight === previousHeight) break;
  }

  return Array.from(products);
};

const extractProductData = async (page, url) => {
  console.log(`Navigating to product page: ${url}`);
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('h1', { timeout: 10000 });

    // Extract product data
    const productData = await page.evaluate(() => {
      const extractTextByClass = (selector) => {
        const element = document.querySelector(selector);
        return element ? element.innerText.trim() : '';
      };

      let availability = 'OUT OF STOCK';
      let estimateAvailability = ''; // Default to an empty string if no estimate is found

      // Check for stock information
      const firstLi = document.querySelector('ul.pl-11.text-body-2.availability__list li');
      if (firstLi) {
        const quantitySpan = firstLi.querySelector('span.font-weight-bold.availability__label');
        const dateTextNode = firstLi.childNodes[1];

        if (quantitySpan && dateTextNode) {
          availability = quantitySpan.innerText.trim(); // Set the arriving quantity
          estimateAvailability = `Arriving On ${dateTextNode.textContent.trim()}`; // Set the estimated arrival date
        }
      } else {
        // Check if the product is in stock
        const availabilityLabel = document.querySelector('span.font-weight-bold.availability__label');
        const availabilityTextNode = availabilityLabel ? availabilityLabel.nextSibling.textContent.trim() : '';
        if (availabilityLabel && availabilityLabel.innerText.includes('In-Stock Availability')) {
          availability = availabilityTextNode.trim(); // Set the in-stock quantity
          estimateAvailability = ''; // No estimated availability needed if in stock
        }
      }

      return {
        name: extractTextByClass('h1'),
        sku: extractTextByClass('.product-title__sku'),
        availability: availability,
        estimateAvailability: estimateAvailability,
      };
    });

    console.log(productData);

    return productData;
  } catch (error) {
    console.error(`Failed to navigate to product page: ${url}`, error.message);
    return null;
  }
};

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  const allProductData = [];

  const csvWriter = createCsvWriter({
    path: './data/closeouts.csv',
    header: [
      { id: 'category', title: 'Category' },
      { id: 'productLink', title: 'Product Link' },
      { id: 'name', title: 'Product Name' },
      { id: 'sku', title: 'SKU' },
      { id: 'price', title: 'Price' },
      { id: 'availability', title: 'Availability' },
      { id: 'estimateAvailability', title: 'Estimate Availability' },
      { id: 'description', title: 'Description' },
      { id: 'images', title: 'Images' },
      { id: 'links', title: 'Links' }
    ]
  });

  try {
    // Log in to the website
    const loginUrl = 'https://www.dovetailhome.com/account/login/';
    console.log(`Navigating to login page: ${loginUrl}`);
    await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 100000 });
    console.log('Filling out login form...');
    await page.type('input[name="email"]', 'hagoptrade@gmail.com');
    await page.type('input[name="password"]', 'Furniture?66');
    await page.click('button[type="button"]'); // Ensure this is the correct button type
    console.log('Waiting for redirection to home page...');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 100000 });

    // Confirm login and redirect
    const currentUrl = page.url();
    if (!currentUrl.includes('https://www.dovetailhome.com/')) {
      throw new Error('Login failed or did not redirect to the home page.');
    }
    console.log('Successfully logged in and redirected.');

    for (const { name, url } of urls) {
      try {
        console.log(`Navigating to ${name} section: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 100000 });

        console.log('Scrolling and extracting product links...');
        const productLinks = await scrollAndExtractProducts(page, 'a.mb-9.v-card.v-card--flat.v-card--link.v-sheet.theme--light.rounded-0');

        const totalProducts = productLinks.length;
        console.log(`Total product links found in ${name}: ${totalProducts}`);

        if (totalProducts === 0) {
          console.log(`No product links found in ${name}.`);
          continue;
        }

        // Process each product link
        for (let i = 0; i < totalProducts; i++) {
          const productData = await extractProductData(page, productLinks[i]);
          if (productData) {
            console.log(`Scraped ${i + 1} out of ${totalProducts} for ${name}`);
            allProductData.push({ category: name, productLink: productLinks[i], ...productData });
          }
          // Add a delay between requests to avoid rate limiting
          await sleep(1000); // 1-second delay
        }
      } catch (error) {
        console.error(`An error occurred while processing ${name}:`, error);
      }
    }

    // Write all product data to CSV
    console.log('Saving data to CSV...');
    try {
      await csvWriter.writeRecords(allProductData);
      console.log('CSV file has been created and data has been written to it.');
    } catch (writeError) {
      console.error('Failed to write CSV file:', writeError.message);
    } finally {
      console.log('Closing browser...');
      await browser.close();
    }
  } catch (error) {
    console.error('An error occurred during login or scraping:', error);
    await browser.close(); // Ensure the browser is closed on error
  }
})();
