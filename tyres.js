const axios = require('axios');

// Configuration settings
const API_KEY = 'tireoutlet';
const SHOPIFY_STORE_URL = process.env.Store_utn;
const SHOPIFY_ACCESS_TOKEN = SHOPIFY_ACCESS_TOKEN;
const PAGE_SIZE = 20; // Adjust this as needed

// Function to fetch tire data from the API
async function fetchTireData(pageNumber) {
    try {
        const response = await axios.get(process.env.URLTOFETCHTIRES);
        
        // Log the full response to inspect it
        console.log(`API Response for page ${pageNumber}:`, response.data);

        if (response.data && response.data.TireModels && response.data.TireModels.length > 0) {
            console.log(`Fetched ${response.data.TireModels.length} tire models on page ${pageNumber}`);
            return {
                tireModels: response.data.TireModels,
                moreItems: response.data.MoreItems || response.data.TireModels.length >= PAGE_SIZE, // Continue if models found, even if MoreItems is false
            };
        } else {
            console.log(`No tire models found on page ${pageNumber}`);
            return {
                tireModels: [],
                moreItems: false,
            };
        }
    } catch (error) {
        console.error(`Failed to fetch tire data on page ${pageNumber}:`, error.message);
        return {
            tireModels: [],
            moreItems: false,
        };
    }
}

// Function to send data to Shopify
async function sendToShopify(tireModels) {
    for (const model of tireModels) {
        try {
            const response = await axios.get(process.env.URLFETCHTIRES);
            const tires = response.data.Tires;

            const variants = tires.map(tire => ({
                option1: tire.PartNumber,
                option2: tire.Size,
                price: tire.Price || 0,
                sku: tire.PartNumber,
                title: `${tire.PartNumber} - ${tire.Size}`,
                metafields: [
                    { key: "display_name", value: tire.DisplayName, type: "string", namespace: "accentuate" },
                    { key: "diameter", value: tire.Diameter, type: "string", namespace: "accentuate" },
                    { key: "overall_diameter", value: tire.OverallDiameter, type: "string", namespace: "accentuate" },
                    { key: "overall_width", value: tire.OverallWidth, type: "string", namespace: "accentuate" },
                    { key: "section_width", value: tire.SectionWidth, type: "string", namespace: "accentuate" },
                    { key: "max_psi", value: tire.MaxInflationPressure, type: "string", namespace: "accentuate" },
                    { key: "inch_width", value: tire.InchWidth, type: "string", namespace: "accentuate" },
                    { key: "aspect_ratio", value: tire.AspectRatio, type: "string", namespace: "accentuate" },
                    { key: "load_range", value: tire.LoadRange, type: "string", namespace: "accentuate" },
                    { key: "tread_depth", value: tire.TreadDepth, type: "string", namespace: "accentuate" },
                    { key: "weight", value: tire.Weight, type: "string", namespace: "accentuate" },
                    { key: "load_capacity", value: tire.LoadCapacitySingle, type: "string", namespace: "accentuate" },
                    { key: "revolutions", value: tire.RevolutionsPerMile, type: "string", namespace: "accentuate" },
                    { key: "load_rating", value: tire.LoadRating, type: "string", namespace: "accentuate" },
                    { key: "speed_rating", value: tire.SpeedRating, type: "string", namespace: "accentuate" },
                    { key: "gm_code", value: tire.GmCode, type: "string", namespace: "accentuate" },
                    { key: "upc", value: tire.Upc, type: "string", namespace: "accentuate" },
                    { key: "warranty", value: tire.Warranty, type: "string", namespace: "accentuate" }
                ]
            }));

            const images = [];
            const imgBaseUrl = PROCESS.ENV.IMAGEBASEURL;
            const imageKeys = ['ImgAngle', 'ImgThumb', 'ImgFront', 'ImgSide1', 'ImgSide2'];

            imageKeys.forEach(key => {
                if (model[key]) {
                    images.push({ src: imgBaseUrl + model[key] });
                }
            });

            const segmentTags = model.SegmentTags || [];
            const vehicleTypeTags = model.VehicleTypeTags || [];
            const tags = [...segmentTags, ...vehicleTypeTags].join(', ');

            const productData = {
                product: {
                    title: model.Model,
                    body_html: model.Description,
                    vendor: model.Brand,
                    product_type: 'Tire',
                    tags: tags,
                    images: images,
                    options: [
                        { name: 'Part Number' },
                        { name: 'Size' }
                    ],
                    variants: variants,
                    metafields: [
                        { key: "benefits", value: model.Benefits, type: "string", namespace: "accentuate" },
                        { key: "features", value: model.Features, type: "string", namespace: "accentuate" }
                    ]
                }
            };

            const shopifyResponse = await axios.post(SHOPIFY_STORE_URL, productData, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
                }
            });

            if (shopifyResponse.data && shopifyResponse.data.product) {
                console.log(`Successfully synced product ${model.Model} to Shopify`);
            }
        } catch (error) {
            console.error(`Failed to send product ${model.Model} to Shopify:`, error.message);
        }
    }
}

// Main function to handle the entire sync process
async function syncTiresToShopify() {
    let pageNumber = 30;
    let moreItems = true;

    while (moreItems) {
        const { tireModels, moreItems: hasMoreItems } = await fetchTireData(pageNumber);
        if (tireModels.length > 0) {
            await sendToShopify(tireModels);
            pageNumber += 1;
            moreItems = hasMoreItems; // Update the loop condition based on the API response
        } else {
            moreItems = false;
            console.log('No more tire models to fetch. Sync complete.');
        }
    }
}

// Start the sync process
syncTiresToShopify();
