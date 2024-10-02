const puppeteer = require('puppeteer');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csv = require('csv-parser');
const fs = require('fs');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const urls = [
    {
        name: "Bedroom",
        "url": "https://www.dovetailhome.com/bedroom/?listing=True&p=1&c=1073741858__CatalogContent&sort=Newest"
      },
  // Add other URLs as needed
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

    previousHeight = await page.evaluate('document.body.scrollHeight');
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await sleep(3000);

    const newHeight = await page.evaluate('document.body.scrollHeight');
    if (newHeight === previousHeight) break;
  }

  return Array.from(products);
};

const extractProductData = async (page, url) => {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('h1', { timeout: 10000 });

    const productData = await page.evaluate(() => {
      const extractTextByClass = (selector) => {
        const element = document.querySelector(selector);
        return element ? element.innerText.trim() : '';
      };

      let availability = 'OUT OF STOCK';
      let estimateAvailability = '';

      const firstLi = document.querySelector('ul.pl-11.text-body-2.availability__list li');
      if (firstLi) {
        const quantitySpan = firstLi.querySelector('span.font-weight-bold.availability__label');
        const dateTextNode = firstLi.childNodes[1];

        if (quantitySpan && dateTextNode) {
          availability = quantitySpan.innerText.trim();
          estimateAvailability = `Arriving On ${dateTextNode.textContent.trim()}`;
        }
      } else {
        const availabilityLabel = document.querySelector('span.font-weight-bold.availability__label');
        const availabilityTextNode = availabilityLabel ? availabilityLabel.nextSibling.textContent.trim() : '';
        if (availabilityLabel && availabilityLabel.innerText.includes('In-Stock Availability')) {
          availability = availabilityTextNode.trim();
          estimateAvailability = '';
        }
      }

      return {
        name: extractTextByClass('h1'),
        sku: extractTextByClass('.product-title__sku'),
        availability: availability,
        estimateAvailability: estimateAvailability,
      };
    });

    return productData;
  } catch (error) {
    console.error(`Failed to navigate to product page: ${url}`, error.message);
    return null;
  }
};

const readExistingCSV = async (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
};

const saveCSV = async (filePath, data) => {
  const csvWriter = createCsvWriter({
    path: filePath,
    header: [
      { id: 'category', title: 'Category' },
      { id: 'name', title: 'Product Name' },
      { id: 'sku', title: 'SKU' },
      { id: 'availability', title: 'Availability' },
      { id: 'estimateAvailability', title: 'Estimate Availability' },
    ]
  });

  await csvWriter.writeRecords(data);
  console.log('CSV file has been created/updated and data has been written to it.');
};

const compareProducts = (newProduct, existingProduct) => {
  return newProduct.name === existingProduct.name &&
         newProduct.sku === existingProduct.sku &&
         newProduct.availability === existingProduct.availability &&
         newProduct.estimateAvailability === existingProduct.estimateAvailability;
};

(async () => {
  const csvFilePath = '../data/diningNew.csv';
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  const allProductData = [];

  try {
    const existingProducts = await readExistingCSV(csvFilePath);
   
    // Log in to the website
    const loginUrl = 'https://www.dovetailhome.com/account/login/';
    console.log(`Navigating to login page: ${loginUrl}`);
    await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 100000 });
    await page.type('input[name="email"]', 'hagoptrade@gmail.com');
    await page.type('input[name="password"]', 'Furniture?66');
    await page.click('button[type="button"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 100000 });

    for (const { name, url } of urls) {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 100000 });
      const productLinks = await scrollAndExtractProducts(page, 'a.mb-9.v-card.v-card--flat.v-card--link.v-sheet.theme--light.rounded-0');
      const totalProducts = productLinks.length;
      console.log(`Total product links found in ${name}: ${totalProducts}`);

      if (totalProducts === 0) continue;

      for (const productLink of productLinks) {
        const productData = await extractProductData(page, productLink);
        if (productData) {
          const newProduct = { category: name, productLink, ...productData };
          allProductData.push(newProduct);
        }
        await sleep(1000);
      }
    }

    // Compare new data against existing data
    const updatedProducts = allProductData.filter((newProduct) => {
      const matchingProduct = existingProducts.find((existingProduct) => existingProduct.productLink === newProduct.productLink);
      return matchingProduct && !compareProducts(newProduct, matchingProduct);
    });

    // Find new products (those that don't exist in the CSV)
    const newProducts = allProductData.filter(
      (newProduct) => !existingProducts.some((existingProduct) => existingProduct.productLink === newProduct.productLink)
    );

    // Find removed products (those that exist in the CSV but no longer on the website)
    const removedProducts = existingProducts.filter(
      (existingProduct) => !allProductData.some((newProduct) => newProduct.productLink === existingProduct.productLink)
    );

    // Merge the existing and new products while excluding removed products
    const finalProducts = [
      ...existingProducts.filter((product) => !removedProducts.includes(product)),
      ...newProducts
    ];

    console.log(`Total Products in CSV before: ${existingProducts.length}`);
    console.log(`Total Products on Website: ${allProductData.length}`);
    console.log(`Number of New Products: ${newProducts.length}`);
    console.log(`Number of Removed Products: ${removedProducts.length}`);
    
    // Save the updated CSV data
    await saveCSV(csvFilePath, finalProducts);
  } catch (error) {
    console.error('An error occurred during login or scraping:', error);
  } finally {
    await browser.close();
  }
})();
