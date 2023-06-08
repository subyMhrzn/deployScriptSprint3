/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

// const {onRequest} = require("firebase-functions/v2/https");
// const logger = require("firebase-functions/logger");

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { Storage } = require("@google-cloud/storage");
const storage = new Storage();






admin.initializeApp();
exports.crawlColesData = functions
    .region("australia-southeast1")
    .pubsub.schedule("25 19 * * SUN")
    .onRun(async (context) => {

        const { Cluster } = require("puppeteer-cluster");
        const puppeteer = require("puppeteer");
        require("dotenv").config();

        const urls = [
            "https://www.coles.com.au/browse/meat-seafood",
            "https://www.coles.com.au/browse/fruit-vegetables",
            "https://www.coles.com.au/browse/dairy-eggs-fridge",
            "https://www.coles.com.au/browse/bakery",
            "https://www.coles.com.au/browse/deli",
            "https://www.coles.com.au/browse/household",
            "https://www.coles.com.au/browse/health-beauty",
            "https://www.coles.com.au/browse/baby",
            "https://www.coles.com.au/browse/pet",
            "https://www.coles.com.au/browse/liquor",
            "https://www.coles.com.au/browse/bonus-cookware-credits",
            "https://www.coles.com.au/browse/pantry",
            "https://www.coles.com.au/browse/drinks",
            "https://www.coles.com.au/browse/frozen",
        ];
        // const array = [];
        (async () => {
            const cluster = await Cluster.launch({
                concurrency: Cluster.CONCURRENCY_PAGE,
                maxConcurrency: 3,
                retryLimit: 5,
                timeout: 4200000,
                puppeteerOptions: {
                    headless: "new",
                    executablePath: process.env.NODE_ENV === 'production'
                        ? process.env.PUPPETEER_EXECUTABLE_PATH
                        : puppeteer.executablePath(),
                    defaultViewport: null,
                    // userDataDir: "./tmp",
                    timeout: 6000000,
                    nodeIntegration: true,
                    args: [
                        // "--start-maximized",
                        "--cpu-profile-interval=500",
                        "--memory-pressure-off",
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        '--disable-web-security',
                        '--disable-features=IsolateOrigins,site-per-process',
                    ],
                },
            });
            cluster.on("taskerror", (err, data) => {
                console.log(`Error crawling ${data}: ${err.message}`);
            });
            await cluster.task(async ({ page, data: url }) => {
                await page.goto(url, {
                    waitUntil: "load",
                    // timeout: 600000
                });
                await page.waitForSelector("button#pagination-button-next", { visible: true, timeout: 35000 });
                await page.waitForSelector('div#coles-targeting-main-container');
                const category = await page.$eval("div > h1", (el) => el.textContent);
                let isBtnDisabled = false;
                const scrapedData = [];
                const delay = 500;
                const scrollAmount = 900;
                while (!isBtnDisabled) {
                    await page.waitForSelector("section[data-testid='product-tile']");
                    const productHandles = await page.$$(".product__header");
                    let currentPosition = 0;
                    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
                    while (currentPosition < scrollHeight) {
                        await page.evaluate((scrollAmount) => {
                            window.scrollBy(0, scrollAmount, { behavior: 'smooth' });
                        }, scrollAmount);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        currentPosition += scrollAmount;
                        // console.log(currentPosition);
                    }
                    for (const productHandle of productHandles) {
                        let title = "Null";
                        let price = "Null";
                        let image = "Null";
                        try {
                            title = await page.evaluate((el) => {
                                return el.querySelector(".product__title").textContent;
                            }, productHandle);
                        } catch (error) {
                            console.error("An error occurred while" +
                                " getting the product title:", error);
                        }
                        try {
                            price = await page.evaluate((el) => {
                                return el.querySelector(".price__value").textContent;
                            }, productHandle);
                        } catch (error) {
                            console.error("An error occurred while" +
                                " getting the product price:", error);
                        }
                        try {
                            image = await page.evaluate(
                                (el) => el.querySelector('img[data-testid="product-image"]')
                                    .getAttribute("src"), productHandle);
                        } catch (error) {
                            console.error("An error occurred while" +
                                " getting the product image:", error);
                        }
                        if (title !== "Null") {
                            scrapedData.push({
                                itemTitle: title,
                                itemPrice: price,
                                itemImage: image,
                            });
                        }
                    }
                    scrlamt = -900;
                    await page.evaluate((scrlamt) => {
                        window.scrollBy(0, scrlamt);
                    }, scrlamt);
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    await page.waitForSelector(".sc-c6633df8-1.hyMvJd.coles-targeting-PaginationPaginationUl", { visible: true });
                    const is_disabled = await page.evaluate(() => document.querySelector('button#pagination-button-next[disabled]') !== null);


                    isBtnDisabled = is_disabled;
                    if (!is_disabled) {
                        await Promise.all([

                            page.waitForSelector("button#pagination-button-next", { visible: true, timeout: 60000 }),
                            page.click("button#pagination-button-next"),
                        ]);
                    }
                }
                console.log(scrapedData);
                const bucketName = "musketeer-group-project.appspot.com/ColesScrapedData";
                const bucket = storage.bucket(bucketName);
                const file = bucket.file(`${category}.json`);
                await file.save(JSON.stringify(scrapedData));
                console.log(`Success!!, Coles ${category} scrpaed data has been saved to JSON file`);
            });
            for (const url of urls) {
                await cluster.queue(url);
            }
            await cluster.idle();
            await cluster.close();
        })();
    });

exports.crawlWWData = functions.region("australia-southeast1")
    .pubsub.schedule("0 5 * * FRI")
    .onRun(async (context) => {
        const puppeteer = require('puppeteer-extra');
        const { Cluster } = require('puppeteer-cluster');
        // Add stealth plugin and use defaults 
        const pluginStealth = require('puppeteer-extra-plugin-stealth');
        const { executablePath } = require('puppeteer');


        // Use stealth
        puppeteer.use(pluginStealth());
        const urls = [
            "https://www.woolworths.com.au/shop/browse/fruit-veg?sortBy=TraderRelevance&pageNumber=1&filter=SoldBy(Woolworths)",
            "https://www.woolworths.com.au/shop/browse/meat-seafood-deli?sortBy=TraderRelevance&pageNumber=1&filter=SoldBy(Woolworths)",
            "https://www.woolworths.com.au/shop/browse/bakery?sortBy=TraderRelevance&pageNumber=1&filter=SoldBy(Woolworths)",
            "https://www.woolworths.com.au/shop/browse/dairy-eggs-fridge?sortBy=TraderRelevance&pageNumber=1&filter=SoldBy(Woolworths)",
            "https://www.woolworths.com.au/shop/browse/health-wellness?sortBy=TraderRelevance&pageNumber=1&filter=SoldBy(Woolworths)",
            "https://www.woolworths.com.au/shop/browse/lunch-box?sortBy=TraderRelevance&pageNumber=1&filter=SoldBy(Woolworths)",
            "https://www.woolworths.com.au/shop/browse/drinks?sortBy=TraderRelevance&pageNumber=1&filter=SoldBy(Woolworths)",
            "https://www.woolworths.com.au/shop/browse/liquor?sortBy=TraderRelevance&pageNumber=1&filter=SoldBy(Woolworths)",
            "https://www.woolworths.com.au/shop/browse/baby?sortBy=TraderRelevance&pageNumber=1&filter=SoldBy(Woolworths)",
            "https://www.woolworths.com.au/shop/browse/pet?sortBy=TraderRelevance&pageNumber=1&filter=SoldBy(Woolworths)",
            "https://www.woolworths.com.au/shop/browse/pantry?sortBy=TraderRelevance&pageNumber=1&filter=SoldBy(Woolworths)",
            "https://www.woolworths.com.au/shop/browse/snacks-confectionery?sortBy=TraderRelevance&pageNumber=1&filter=SoldBy(Woolworths)",
            "https://www.woolworths.com.au/shop/browse/beauty-personal-care?sortBy=TraderRelevance&pageNumber=1&filter=SoldBy(Woolworths)",
            "https://www.woolworths.com.au/shop/browse/household?sortBy=TraderRelevance&pageNumber=1&filter=SoldBy(Woolworths)",
            "https://www.woolworths.com.au/shop/browse/freezer?sortBy=TraderRelevance&pageNumber=1&filter=SoldBy(Woolworths)",
        ];
        //Launch pupputeer-stealth
        Cluster.launch({
            concurrency: Cluster.CONCURRENCY_CONTEXT,
            maxConcurrency: 5,
            retryLimit: 2,
            timeout: 4200000,
            // monitor:true,
            puppeteerOptions: {
                headless: "new",
                defaultViewport: null,
                executablePath: executablePath(),
                // devtools: true,
                userDataDir: "./tmp",
                timeout: 6000000,
                protocolTimeout: 6000000,
                args: ['--start-maximized',
                    '--cpu-profile-interval=500',
                    '--memory-pressure-off',
                    '--no-sandbox',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process']
            }
        }).then(async cluster => {
            cluster.on("taskerror", (err, data) => {
                console.log(`Error Crawling ${data}: ${err.message}`)
            });
            await cluster.task(async ({ page, data: url }) => {
                await page.goto(url, {
                    waitUntil: 'load',
                    timeout: 600000
                });
                await page.waitForSelector('#search-content');
                const category = await page.$eval('div > h1.browseContainer-title.ng-star-inserted', el => el.textContent.trim());
                let isBtn = true;
                const scrapedData = [];
                while (isBtn) {
                    await page.waitForSelector('shared-grid');
                    const productHandles = await page.$$('.product-tile-v2', { timeout: 35000, visible: true });
                    for (const productHandle of productHandles) {
                        let price = "Null"; let title = 'Null'; let image = "Null";
                        try {
                            title = await page.evaluate(
                                el => el.querySelector('.product-title-link').textContent, productHandle);
                        } catch (error) { }
                        try {
                            price = await page.evaluate(
                                el => { const priceString = el.querySelector('div.primary').textContent.replace('$', '').trim(); return parseFloat(priceString) }, productHandle);
                        } catch (error) { }
                        try {
                            image = await page.evaluate(
                                el => el.querySelector('.product-tile-v2--image > a > img').getAttribute('src'), productHandle);
                        } catch (error) { }
                        scrapedData.push({
                            itemTitle: title,
                            itemPrice: price,
                            itemImage: image,
                        });
                    }
                    await page.waitForSelector("div.paging-section", { visible: true });
                    const is_button = await page.evaluate(() => document.querySelector('a.paging-next') !== null);
                    isBtn = is_button;
                    if (is_button) {
                        await page.waitForSelector("a.paging-next.ng-star-inserted", { visible: true, timeout: 35000 });
                        await page.click("span.next-marker", { delay: 6000 });
                    }
                    else {
                        await new Promise(resolve => setTimeout(resolve, 6000));
                    }
                }
                //write to file on category based
                const bucketName = "musketeer-group-project.appspot.com/wwScrapedData";
                const bucket = storage.bucket(bucketName);
                const file = bucket.file(`${category}.json`);
                await file.save(JSON.stringify(scrapedData));
                console.log(`Success!!, Coles ${category} scrpaed data has been saved to JSON file`);

            });
            for (const url of urls) {
                await cluster.queue(url);
            }
            await cluster.idle();
            await cluster.close();

        });
    });