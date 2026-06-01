import puppeteer from 'puppeteer';
import { convertSearchData, LocationType, Seat, TripType, Passenger } from 'google-flights-url-generator';

(async () => {
  console.log("Starting Puppeteer URL Validation Test...");

  const origin = "JFK";
  const dest = "LHR";
  const outDate = "2026-06-15";
  const retDate = "2026-06-25";
  
  // Generating URL for 2 Adults, 1 Child
  const passengers = [Passenger.ADULT, Passenger.ADULT, Passenger.CHILD];

  try {
    const urlData = convertSearchData({
      seat: Seat.ECONOMY,
      passengers,
      tripType: TripType.ROUND_TRIP,
      flights: [{
        source: { type: LocationType.AIRPORT, name: origin },
        destination: { type: LocationType.AIRPORT, name: dest },
        date: outDate,
      }, {
        source: { type: LocationType.AIRPORT, name: dest },
        destination: { type: LocationType.AIRPORT, name: origin },
        date: retDate,
      }]
    });

    const flightUrl = urlData.URL;
    console.log(`\nGenerated Protobuf URL: \n${flightUrl}\n`);

    if (!flightUrl.includes('tfs=')) {
      throw new Error("URL does not contain expected tfs= protobuf payload.");
    }

    console.log("Launching headless browser to validate navigation...");
    const browser = await puppeteer.launch({ 
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    // Google Flights blocks some bot traffic, set a user agent
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    await page.goto(flightUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait a couple seconds for JS rendering
    await new Promise(r => setTimeout(r, 2000));

    // Take screenshot of what Google Flights rendered
    await page.screenshot({ path: 'flight_validation.png' });
    console.log("Screenshot saved to flight_validation.png");

    const title = await page.title();
    const currentUrl = page.url();
    
    console.log(`\nPage Title: ${title}`);
    
    if (currentUrl.includes('travel/flights')) {
      console.log("✅ SUCCESS: URL successfully navigated to Google Flights Search.");
    } else {
      console.error("❌ ERROR: URL redirected away from Google Flights.");
      process.exit(1);
    }

    await browser.close();
    console.log("\nValidation Test Completed Successfully!");

  } catch (err) {
    console.error("Test Failed:", err);
    process.exit(1);
  }
})();
