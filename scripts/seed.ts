import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'car-search.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

const now = new Date().toISOString();
const yesterday = new Date(Date.now() - 86400000).toISOString();
const twoDaysAgo = new Date(Date.now() - 172800000).toISOString();

const sampleListings = [
  { vin: '5TFCZ5AN1HX001234', source: 'cars.com', url: 'https://www.cars.com/vehicledetail/1', image_url: 'https://placehold.co/400x300?text=2017+Tacoma', year: 2017, make: 'Toyota', model: 'Tacoma', trim: 'SR5 V6', price: 1195000, mileage: 87000, location: 'Denver, CO', dealer_name: 'Mile High Toyota', dealer_type: 'dealer', one_owner: 1, no_accidents: 1, personal_use: 1, deal_rating: 'Great', deal_score: 8.5, view_status: 'new', first_seen_at: now, last_seen_at: now },
  { vin: '5TFCZ5AN2HX005678', source: 'autotrader', url: 'https://www.autotrader.com/cars/2', image_url: 'https://placehold.co/400x300?text=2015+Tacoma', year: 2015, make: 'Toyota', model: 'Tacoma', trim: 'TRD Sport', price: 1089000, mileage: 112000, location: 'Austin, TX', dealer_name: 'Lone Star Auto', dealer_type: 'dealer', one_owner: 0, no_accidents: 1, personal_use: 0, deal_rating: 'Good', deal_score: 6.5, view_status: 'new', first_seen_at: now, last_seen_at: now },
  { vin: '5TFCZ5AN3HX009012', source: 'kbb', url: 'https://www.kbb.com/cars/3', image_url: 'https://placehold.co/400x300?text=2014+Tacoma', year: 2014, make: 'Toyota', model: 'Tacoma', trim: 'PreRunner', price: 895000, mileage: 134000, location: 'Portland, OR', dealer_name: null, dealer_type: 'private', one_owner: 1, no_accidents: 1, personal_use: 1, deal_rating: 'Good', deal_score: 7.8, view_status: 'new', first_seen_at: now, last_seen_at: now },
  { vin: '5TFCZ5AN4HX003456', source: 'cars.com', url: 'https://www.cars.com/vehicledetail/4', image_url: 'https://placehold.co/400x300?text=2016+Tacoma', year: 2016, make: 'Toyota', model: 'Tacoma', trim: 'SR', price: 1349000, mileage: 76000, location: 'Seattle, WA', dealer_name: 'Emerald City Trucks', dealer_type: 'dealer', one_owner: 1, no_accidents: 0, personal_use: 1, deal_rating: 'Fair', deal_score: 5.5, view_status: 'new', first_seen_at: yesterday, last_seen_at: now },
  { vin: 'JTEBU5JR5D5001111', source: 'autotrader', url: 'https://www.autotrader.com/cars/5', image_url: 'https://placehold.co/400x300?text=2013+4Runner', year: 2013, make: 'Toyota', model: '4Runner', trim: 'SR5', price: 1429000, mileage: 98000, location: 'Phoenix, AZ', dealer_name: 'Desert Motors', dealer_type: 'dealer', one_owner: 0, no_accidents: 1, personal_use: 0, deal_rating: 'Good', deal_score: 6.0, view_status: 'new', first_seen_at: yesterday, last_seen_at: now },
  { vin: 'JTEBU5JR6D5002222', source: 'cars.com', url: 'https://www.cars.com/vehicledetail/6', image_url: 'https://placehold.co/400x300?text=2012+4Runner', year: 2012, make: 'Toyota', model: '4Runner', trim: 'Trail', price: 1199000, mileage: 142000, location: 'Nashville, TN', dealer_name: null, dealer_type: 'private', one_owner: 1, no_accidents: 1, personal_use: 1, deal_rating: 'Great', deal_score: 8.0, view_status: 'seen', first_seen_at: twoDaysAgo, last_seen_at: now },
  { vin: 'JTEBU5JR7D5003333', source: 'kbb', url: 'https://www.kbb.com/cars/7', image_url: 'https://placehold.co/400x300?text=2015+4Runner', year: 2015, make: 'Toyota', model: '4Runner', trim: 'Limited', price: 1489000, mileage: 89000, location: 'Raleigh, NC', dealer_name: 'Triangle Auto Group', dealer_type: 'dealer', one_owner: 1, no_accidents: 1, personal_use: 1, deal_rating: 'Good', deal_score: 7.0, view_status: 'new', first_seen_at: now, last_seen_at: now },
  { vin: '5TFCZ5AN8HX004444', source: 'autotrader', url: 'https://www.autotrader.com/cars/8', image_url: 'https://placehold.co/400x300?text=2018+Tacoma', year: 2018, make: 'Toyota', model: 'Tacoma', trim: 'TRD Off-Road', price: 1499000, mileage: 62000, location: 'Salt Lake City, UT', dealer_name: 'Wasatch Auto', dealer_type: 'dealer', one_owner: 1, no_accidents: 1, personal_use: 0, deal_rating: 'Fair', deal_score: 6.5, view_status: 'new', first_seen_at: now, last_seen_at: now },
  { vin: '5TFCZ5AN9HX005555', source: 'cars.com', url: 'https://www.cars.com/vehicledetail/9', image_url: 'https://placehold.co/400x300?text=2011+Tacoma', year: 2011, make: 'Toyota', model: 'Tacoma', trim: 'Base', price: 699000, mileage: 178000, location: 'Minneapolis, MN', dealer_name: null, dealer_type: 'private', one_owner: 0, no_accidents: 0, personal_use: 0, deal_rating: null, deal_score: 4.5, view_status: 'seen', first_seen_at: twoDaysAgo, last_seen_at: yesterday },
  { vin: '5TFCZ5AN0HX006666', source: 'kbb', url: 'https://www.kbb.com/cars/10', image_url: 'https://placehold.co/400x300?text=2019+Tacoma', year: 2019, make: 'Toyota', model: 'Tacoma', trim: 'SR5', price: 1450000, mileage: 54000, location: 'Chicago, IL', dealer_name: 'Windy City Toyota', dealer_type: 'dealer', one_owner: 1, no_accidents: 1, personal_use: 1, deal_rating: 'Great', deal_score: 8.8, view_status: 'new', first_seen_at: now, last_seen_at: now },
  { vin: 'JTEBU5JR1D5007777', source: 'autotrader', url: 'https://www.autotrader.com/cars/11', image_url: 'https://placehold.co/400x300?text=2014+4Runner', year: 2014, make: 'Toyota', model: '4Runner', trim: 'SR5 Premium', price: 1299000, mileage: 115000, location: 'Atlanta, GA', dealer_name: 'Peachtree Auto Mall', dealer_type: 'dealer', one_owner: 0, no_accidents: 1, personal_use: 1, deal_rating: 'Good', deal_score: 6.8, view_status: 'new', first_seen_at: yesterday, last_seen_at: now },
  { vin: '5TFCZ5AN2HX008888', source: 'cars.com', url: 'https://www.cars.com/vehicledetail/12', image_url: 'https://placehold.co/400x300?text=2016+Tacoma', year: 2016, make: 'Toyota', model: 'Tacoma', trim: 'Limited', price: 1375000, mileage: 92000, location: 'San Antonio, TX', dealer_name: 'Alamo Motors', dealer_type: 'dealer', one_owner: 1, no_accidents: 1, personal_use: 0, deal_rating: 'Good', deal_score: 7.0, view_status: 'new', first_seen_at: now, last_seen_at: now },
  { vin: 'JTEBU5JR3D5009999', source: 'kbb', url: 'https://www.kbb.com/cars/13', image_url: 'https://placehold.co/400x300?text=2011+4Runner', year: 2011, make: 'Toyota', model: '4Runner', trim: 'SR5', price: 989000, mileage: 156000, location: 'Tampa, FL', dealer_name: null, dealer_type: 'private', one_owner: 1, no_accidents: 1, personal_use: 1, deal_rating: 'Good', deal_score: 7.5, view_status: 'seen', first_seen_at: twoDaysAgo, last_seen_at: now },
  { vin: '5TFCZ5AN4HX010101', source: 'autotrader', url: 'https://www.autotrader.com/cars/14', image_url: 'https://placehold.co/400x300?text=2013+Tacoma', year: 2013, make: 'Toyota', model: 'Tacoma', trim: 'PreRunner V6', price: 849000, mileage: 145000, location: 'Columbus, OH', dealer_name: 'Buckeye Auto Sales', dealer_type: 'dealer', one_owner: 0, no_accidents: 0, personal_use: 0, deal_rating: 'Fair', deal_score: 3.8, view_status: 'new', first_seen_at: now, last_seen_at: now },
  { vin: 'JTEBU5JR5D5011111', source: 'cars.com', url: 'https://www.cars.com/vehicledetail/15', image_url: 'https://placehold.co/400x300?text=2016+4Runner', year: 2016, make: 'Toyota', model: '4Runner', trim: 'TRD Pro', price: 1499000, mileage: 78000, location: 'Boise, ID', dealer_name: 'Treasure Valley Auto', dealer_type: 'dealer', one_owner: 1, no_accidents: 1, personal_use: 1, deal_rating: 'Great', deal_score: 8.2, view_status: 'new', first_seen_at: now, last_seen_at: now },
  { vin: '5TFCZ5AN6HX012121', source: 'kbb', url: 'https://www.kbb.com/cars/16', image_url: 'https://placehold.co/400x300?text=2017+Tacoma', year: 2017, make: 'Toyota', model: 'Tacoma', trim: 'TRD Pro', price: 1450000, mileage: 71000, location: 'Charlotte, NC', dealer_name: 'Queen City Motors', dealer_type: 'dealer', one_owner: 1, no_accidents: 1, personal_use: 0, deal_rating: 'Good', deal_score: 7.2, view_status: 'new', first_seen_at: now, last_seen_at: now },
  { vin: '5TFCZ5AN7HX013131', source: 'autotrader', url: 'https://www.autotrader.com/cars/17', image_url: 'https://placehold.co/400x300?text=2010+Tacoma', year: 2010, make: 'Toyota', model: 'Tacoma', trim: 'Base', price: 599000, mileage: 198000, location: 'Tucson, AZ', dealer_name: null, dealer_type: 'private', one_owner: 0, no_accidents: 0, personal_use: 0, deal_rating: null, deal_score: 3.0, view_status: 'new', first_seen_at: now, last_seen_at: now },
  { vin: 'JTEBU5JR8D5014141', source: 'cars.com', url: 'https://www.cars.com/vehicledetail/18', image_url: 'https://placehold.co/400x300?text=2017+4Runner', year: 2017, make: 'Toyota', model: '4Runner', trim: 'SR5', price: 1399000, mileage: 83000, location: 'Dallas, TX', dealer_name: 'Big D Toyota', dealer_type: 'dealer', one_owner: 1, no_accidents: 1, personal_use: 1, deal_rating: 'Good', deal_score: 7.5, view_status: 'new', first_seen_at: yesterday, last_seen_at: now },
  { vin: '5TFCZ5AN9HX015151', source: 'kbb', url: 'https://www.kbb.com/cars/19', image_url: 'https://placehold.co/400x300?text=2015+Tacoma', year: 2015, make: 'Toyota', model: 'Tacoma', trim: 'SR5 Access Cab', price: 1149000, mileage: 105000, location: 'Las Vegas, NV', dealer_name: 'Vegas Auto', dealer_type: 'dealer', one_owner: 0, no_accidents: 1, personal_use: 0, deal_rating: 'Good', deal_score: 6.2, view_status: 'new', first_seen_at: now, last_seen_at: now },
  { vin: 'JTEBU5JR0D5016161', source: 'autotrader', url: 'https://www.autotrader.com/cars/20', image_url: 'https://placehold.co/400x300?text=2018+4Runner', year: 2018, make: 'Toyota', model: '4Runner', trim: 'TRD Off-Road', price: 1495000, mileage: 67000, location: 'Richmond, VA', dealer_name: 'Capital Auto', dealer_type: 'dealer', one_owner: 1, no_accidents: 1, personal_use: 1, deal_rating: 'Great', deal_score: 8.0, view_status: 'new', first_seen_at: now, last_seen_at: now },
];

// Clear existing data
db.exec('DELETE FROM price_history');
db.exec('DELETE FROM notes');
db.exec('DELETE FROM listings');
db.exec('DELETE FROM scrape_runs');

// Insert listings
const insertStmt = db.prepare(`
  INSERT INTO listings (vin, source, url, image_url, year, make, model, trim, price, mileage, location, dealer_name, dealer_type, one_owner, no_accidents, personal_use, deal_rating, deal_score, view_status, first_seen_at, last_seen_at)
  VALUES (@vin, @source, @url, @image_url, @year, @make, @model, @trim, @price, @mileage, @location, @dealer_name, @dealer_type, @one_owner, @no_accidents, @personal_use, @deal_rating, @deal_score, @view_status, @first_seen_at, @last_seen_at)
`);

const insertMany = db.transaction((listings: typeof sampleListings) => {
  for (const listing of listings) {
    insertStmt.run(listing);
  }
});

insertMany(sampleListings);

// Add some sample price history for a couple listings
const listing1 = db.prepare('SELECT id FROM listings WHERE vin = ?').get('5TFCZ5AN1HX001234') as { id: number };
const listing6 = db.prepare('SELECT id FROM listings WHERE vin = ?').get('JTEBU5JR6D5002222') as { id: number };

if (listing1) {
  db.prepare('INSERT INTO price_history (listing_id, price, observed_at) VALUES (?, ?, ?)').run(listing1.id, 1249000, twoDaysAgo);
  db.prepare('INSERT INTO price_history (listing_id, price, observed_at) VALUES (?, ?, ?)').run(listing1.id, 1225000, yesterday);
  db.prepare('INSERT INTO price_history (listing_id, price, observed_at) VALUES (?, ?, ?)').run(listing1.id, 1195000, now);
}

if (listing6) {
  db.prepare('INSERT INTO price_history (listing_id, price, observed_at) VALUES (?, ?, ?)').run(listing6.id, 1250000, twoDaysAgo);
  db.prepare('INSERT INTO price_history (listing_id, price, observed_at) VALUES (?, ?, ?)').run(listing6.id, 1199000, now);
}

// Add some sample notes
if (listing1) {
  db.prepare("INSERT INTO notes (listing_id, type, content, created_at) VALUES (?, 'call', 'Called dealer - truck is still available. Clean title confirmed.', ?)").run(listing1.id, yesterday);
  db.prepare("INSERT INTO notes (listing_id, type, content, created_at) VALUES (?, 'note', 'Good price for the mileage. Check service records.', ?)").run(listing1.id, now);
}

// Add a sample scrape run
db.prepare(`
  INSERT INTO scrape_runs (source, status, new_count, updated_count, started_at, completed_at)
  VALUES ('mcp', 'completed', 20, 0, ?, ?)
`).run(new Date(Date.now() - 1800000).toISOString(), new Date(Date.now() - 1790000).toISOString());

// Seed search_config if not exists
const configExists = db.prepare('SELECT COUNT(*) as count FROM search_config').get() as { count: number };
if (configExists.count === 0) {
  db.prepare(`
    INSERT INTO search_config (id, zip, fb_location, radius_miles, price_max, mileage_max, year_min, year_max, makes_models, cron_interval, fb_enabled)
    VALUES (1, NULL, NULL, 150, 1500000, 200000, 2005, 2025, '[]', 30, 0)
  `).run();
}

db.close();
console.log(`Seeded ${sampleListings.length} listings, price history, notes, and scrape run.`);
