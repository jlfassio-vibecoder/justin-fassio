export interface CatalogItem {
  page: number;
  cat: string;
  sku: string;
  name: string;
  color: string;
  tagline: string;
  priceUsd: number;
  msrpCad: number;
  isNew: boolean;
  isNameDrop: boolean;
}

export const CATALOG_DATA: CatalogItem[] = [
            // Page 4: RED-WHITE-BLUE / SHORT SLEEVE TEES
            { page: 4, cat: "Short Sleeve Tees", sku: "OG2511", name: "AMERICAN DREAM", color: "Stone Blue", tagline: "Living The American Dream", priceUsd: 13.0, msrpCad: 39.99, isNew: true, isNameDrop: false },
            { page: 4, cat: "Short Sleeve Tees", sku: "OG2162", name: "AMERICAN EAGLE", color: "White Pocket Tee", tagline: "Land Of The Free / Proud To Be An American", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 4, cat: "Short Sleeve Tees", sku: "OG2147", name: "MADE IN THE USA", color: "Stone Blue", tagline: "Established Back In The Day", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 4, cat: "Short Sleeve Tees", sku: "OG2513", name: "AMERICAN REVIVAL", color: "Graphite Heather", tagline: "Great American Revival", priceUsd: 13.0, msrpCad: 39.99, isNew: true, isNameDrop: false },
            { page: 4, cat: "Short Sleeve Tees", sku: "OG2512", name: "AMERICAN MARLIN", color: "Black", tagline: "From Sea To Shining Sea", priceUsd: 13.0, msrpCad: 39.99, isNew: true, isNameDrop: false },

            // Page 5: STARS & STRIPES / SHORT SLEEVE TEES
            { page: 5, cat: "Short Sleeve Tees", sku: "OG2514", name: "LIVE FREE", color: "Gravel", tagline: "Live Free", priceUsd: 13.0, msrpCad: 39.99, isNew: true, isNameDrop: false },
            { page: 5, cat: "Short Sleeve Tees", sku: "OG2516", name: "OLD COWBOYS RULE", color: "Ice Grey", tagline: "This Ain't My First Rodeo", priceUsd: 13.0, msrpCad: 39.99, isNew: true, isNameDrop: false },
            { page: 5, cat: "Short Sleeve Tees", sku: "OG2520-GM", name: "AMERICAN MUSCLE", color: "Navy", tagline: "Just Good Ole American Muscle", priceUsd: 13.0, msrpCad: 39.99, isNew: true, isNameDrop: true },
            { page: 5, cat: "Short Sleeve Tees", sku: "OG0033", name: "BORN IN THE USA", color: "Navy", tagline: "Born In The USA", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 5, cat: "Short Sleeve Tees", sku: "OG1032", name: "FLAG SERVED", color: "Heather Navy", tagline: "A Life Well Served", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },

            // Page 6: CELEBRATING AMERICA / SHORT SLEEVE TEES
            { page: 6, cat: "Short Sleeve Tees", sku: "OG2117", name: "STILL GRILLIN'", color: "Heather Indigo", tagline: "Still Chillin' Grillin' & Refillin'", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 6, cat: "Short Sleeve Tees", sku: "OG2230", name: "AMERICAN BBQ", color: "Indigo Blue", tagline: "Smokin' Hot & Seasoned To Perfection", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 6, cat: "Short Sleeve Tees", sku: "OG2090", name: "RED WHITE & BREW", color: "Stone Blue", tagline: "Red White & Brew", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 6, cat: "Short Sleeve Tees", sku: "OG2114", name: "OLD SEA DOG", color: "Light Blue", tagline: "Sea Worthy / Salty Old Dog / A Captain's Best Mate", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 6, cat: "Short Sleeve Tees", sku: "OG2163", name: "BORN & BRED", color: "Heather Military Green", tagline: "Born & Bred In The USA", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 6, cat: "Short Sleeve Tees", sku: "OG2025", name: "FREEDOM STAR", color: "Gravel", tagline: "If You Like Your Freedom Thank An Old Guy", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 6, cat: "Short Sleeve Tees", sku: "OG2051-V", name: "VETERAN EAGLE", color: "Navy", tagline: "Honoring Our Veterans / Not All Heroes Wear Capes", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },

            // Page 7: OLD DOGS RULE / SHORT SLEEVE TEES
            { page: 7, cat: "Short Sleeve Tees", sku: "OG2326", name: "OLD DOGS RULE", color: "Black", tagline: "Loyalty, Born And Bred", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 7, cat: "Short Sleeve Tees", sku: "OG2062", name: "LEASH", color: "Sport Grey", tagline: "Living Life Off The Leash", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 7, cat: "Short Sleeve Tees", sku: "OG2247", name: "DOG'S DAY", color: "Stone Blue", tagline: "Every Dog Has His Day", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },

            // Page 8: AMERICAN OUTDOORS / SHORT SLEEVE TEES
            { page: 8, cat: "Short Sleeve Tees", sku: "OG2013", name: "CHRIS CRAFT", color: "Stone Blue", tagline: "It Took Decades To Look This Good!", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 8, cat: "Short Sleeve Tees", sku: "OG2315", name: "SUNSET COWBOY", color: "Gravel", tagline: "They Just Ride Off Into The Sunset", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 8, cat: "Short Sleeve Tees", sku: "OG2529", name: "OLD GUYS RIDE", color: "Stone Blue", tagline: "Blood, Sweat And Gears", priceUsd: 13.0, msrpCad: 39.99, isNew: true, isNameDrop: false },
            { page: 8, cat: "Short Sleeve Tees", sku: "OG2226", name: "RETIREMENT PLAN", color: "Heather Indigo", tagline: "Official Retirement Plan - I Plan On Going Fishing", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 8, cat: "Short Sleeve Tees", sku: "OG2431", name: "THE BEAR", color: "Stone Blue", tagline: "Closer To Nature / Farther From People", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },

            // Page 9: ROAD TRIPPIN / SHORT SLEEVE TEES
            { page: 9, cat: "Short Sleeve Tees", sku: "OG2093", name: "FRESH BUCKET LIST", color: "Heather Military Green", tagline: "Bucket List", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 9, cat: "Short Sleeve Tees", sku: "OG2089", name: "TRIPPIN'", color: "Black", tagline: "What A Long Strange Trip It's Been", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 9, cat: "Short Sleeve Tees", sku: "OG2335-GM", name: "ROAD TRIPPIN'", color: "Graphite Heather", tagline: "King of the Road", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: true },
            { page: 9, cat: "Short Sleeve Tees", sku: "OG2112", name: "NOWHERE VACATION", color: "Gravel", tagline: "Nowhere To Go, All Day To Get There", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 9, cat: "Short Sleeve Tees", sku: "OG2229", name: "HAPPY CAMPER", color: "Heather Military Green", tagline: "Happy Camper", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 9, cat: "Short Sleeve Tees", sku: "OG2333-GM", name: "ROADHOUSE", color: "Black", tagline: "Home Of The Flippin Good Burger", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: true },

            // Pages 10-11: STILL TRUCKIN / SHORT SLEEVE TEES
            { page: 10, cat: "Short Sleeve Tees", sku: "OG2161-GM", name: "PLAYS WITH TRUCKS", color: "Black", tagline: "Still Plays With Trucks", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: true },
            { page: 10, cat: "Short Sleeve Tees", sku: "OG2242", name: "IRON & OCTANE", color: "Gravel", tagline: "The Older I Get, The Faster I Was", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 10, cat: "Short Sleeve Tees", sku: "OG2435-GM", name: "BUILT NOT BOUGHT", color: "Black", tagline: "Built Not Bought", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: true },
            { page: 10, cat: "Short Sleeve Tees", sku: "OG0921", name: "IT TOOK DECADES", color: "Stone Blue", tagline: "It Took Decades To Look This Good", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 10, cat: "Short Sleeve Tees", sku: "OG2146-GM", name: "TRUCK BAND", color: "Indigo Blue", tagline: "It Took Decades To Look This Good", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: true },
            { page: 11, cat: "Short Sleeve Tees", sku: "OG2145-GM", name: "BIG RED", color: "Black", tagline: "They Don't Make Em Like They Used To", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: true },
            { page: 11, cat: "Short Sleeve Tees", sku: "OG2086-GM", name: "I'M A CLASSIC", color: "Heather Indigo", tagline: "I'm Not Old, I'm A Classic", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: true },
            { page: 11, cat: "Short Sleeve Tees", sku: "OG2144-GM", name: "OLD BLUE", color: "Charcoal", tagline: "Some Things Get Better With Age", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: true },
            { page: 11, cat: "Short Sleeve Tees", sku: "OG2310-1", name: "OLD TRUCKS RULE", color: "Gravel", tagline: "Better To Rust Than To Fade Away", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 11, cat: "Short Sleeve Tees", sku: "OG2042", name: "RUSTY TRUCK", color: "Dark Heather", tagline: "Respect The Rust", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 11, cat: "Short Sleeve Tees", sku: "OG2211-GM", name: "CAMO TRUCK", color: "Military Green", tagline: "A Good Truck Is Hard To Find", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: true },

            // Pages 12-13: NEED FOR SPEED / SHORT SLEEVE TEES
            { page: 12, cat: "Short Sleeve Tees", sku: "OG2171", name: "V8 POWER", color: "Navy", tagline: "High Mileage / Low Maintenance", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 12, cat: "Short Sleeve Tees", sku: "OG0336", name: "PANHEAD", color: "Black", tagline: "Loud, Fast, Built To Last", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 12, cat: "Short Sleeve Tees", sku: "OG2160", name: "RED HOT ROD", color: "Graphite Heather", tagline: "Putting The Hot In Rod Since Way Back When", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 12, cat: "Short Sleeve Tees", sku: "OG2519-GM", name: "TRIFECTA", color: "Black", tagline: "American Classic Aged To Perfection", priceUsd: 13.0, msrpCad: 39.99, isNew: true, isNameDrop: true },
            { page: 12, cat: "Short Sleeve Tees", sku: "OG2170-GM", name: "RED CORVETTE", color: "Graphite Heather", tagline: "Still Lookin Good", priceUsd: 13.0, msrpCad: 39.99, isNew: true, isNameDrop: true },
            { page: 13, cat: "Short Sleeve Tees", sku: "OG2059", name: "WRENCHES", color: "Black", tagline: "Expert At Everything... Just Ask Me", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 13, cat: "Short Sleeve Tees", sku: "OG2239", name: "BORN TO RIDE", color: "Graphite Heather", tagline: "Born To Ride", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 13, cat: "Short Sleeve Tees", sku: "OG2115", name: "SPEED SHOP", color: "Sport Grey", tagline: "All Hopped Up And Going Nowhere Fast", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 13, cat: "Short Sleeve Tees", sku: "OG2254-S", name: "AMERICAN LEGEND", color: "Graphite Heather", tagline: "American Legend (Shelby Series)", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 13, cat: "Short Sleeve Tees", sku: "OG2255-S", name: "GT350", color: "Black", tagline: "Built For Speed Classic Style Better With Age", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 13, cat: "Short Sleeve Tees", sku: "OG2530-S", name: "AMERICAN CLASSIC", color: "White", tagline: "1967 Shelby GT500", priceUsd: 13.0, msrpCad: 39.99, isNew: true, isNameDrop: false },

            // Pages 14-15: GOING MY WAVE? / SHORT SLEEVE TEES
            { page: 14, cat: "Short Sleeve Tees", sku: "OG2407", name: "OLD SURFERS RULE", color: "Navy", tagline: "Living The Swell Life", priceUsd: 13.0, msrpCad: 39.99, isNew: true, isNameDrop: false },
            { page: 14, cat: "Short Sleeve Tees", sku: "OG2521", name: "GOLDEN BADGE", color: "Light Blue", tagline: "When Nothing Goes Right Go Left", priceUsd: 13.0, msrpCad: 39.99, isNew: true, isNameDrop: false },
            { page: 14, cat: "Short Sleeve Tees", sku: "OG2526", name: "BOARD MEETING", color: "Navy", tagline: "Board Meeting", priceUsd: 13.0, msrpCad: 39.99, isNew: true, isNameDrop: false },
            { page: 15, cat: "Short Sleeve Tees", sku: "OG2048", name: "MUSCLE CARS", color: "Black", tagline: "Still Got Muscle", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 15, cat: "Short Sleeve Tees", sku: "OG0819", name: "WAVES", color: "Blue Dusk", tagline: "Set In My Waves", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 15, cat: "Short Sleeve Tees", sku: "OG2157", name: "BEACH CRUISER", color: "Indigo Blue", tagline: "Salty, Classic, & Aged To Perfection", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 15, cat: "Short Sleeve Tees", sku: "OG2312", name: "OLDIE BUT WOODIE", color: "Black", tagline: "Old Guys Rule", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 15, cat: "Short Sleeve Tees", sku: "OG2113", name: "CLASSIC WOODIE", color: "Heather Military Green", tagline: "Classic Style Never Ages", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 15, cat: "Short Sleeve Tees", sku: "OG2017", name: "THE DREAM", color: "Black", tagline: "Living The Dream / Young At Heart", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 15, cat: "Short Sleeve Tees", sku: "OG2425", name: "LIVING THE DREAM", color: "Sky", tagline: "Island Style - Living The Dream", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },

            // Page 16: PERMANENT VACATION / SHORT SLEEVE TEES
            { page: 16, cat: "Short Sleeve Tees", sku: "OG0984", name: "VACATION PALM", color: "Heather Indigo", tagline: "On Permanent Vacation", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 16, cat: "Short Sleeve Tees", sku: "OG2164", name: "OPV", color: "White", tagline: "On Permanent Vacation", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 16, cat: "Short Sleeve Tees", sku: "OG2092", name: "HAMMOCK VACATION", color: "Navy", tagline: "On Permanent Vacation", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 16, cat: "Short Sleeve Tees", sku: "OG2172", name: "LIVIN' THE DREAM", color: "Stone Blue", tagline: "Livin' The Dream / No Worries 24/7", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },

            // Page 17: ISLAND TIME / SHORT SLEEVE TEES
            { page: 17, cat: "Short Sleeve Tees", sku: "OG2410", name: "MAI TIME", color: "Pistachio", tagline: "Island Time is Mai Time", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 17, cat: "Short Sleeve Tees", sku: "OG2409", name: "ISLAND STYLE", color: "Light Blue", tagline: "Time Flies When Your Having Rum", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 17, cat: "Short Sleeve Tees", sku: "OG2412", name: "LIVING THE LIFE", color: "White", tagline: "An Island State Of Mind", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 17, cat: "Short Sleeve Tees", sku: "OG2415", name: "HAD ME AT ALOHA", color: "Corn Silk", tagline: "On Island Time / You Had Me At Aloha", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 17, cat: "Short Sleeve Tees", sku: "OG2426", name: "LOUNGE LIZARD", color: "Pistachio", tagline: "Lounge Like A Lizard / Living On Island Time", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },

            // Pages 18-19: SALT & SUN / SHORT SLEEVE & UPF50 SUN SHIRTS
            { page: 18, cat: "Short Sleeve Tees", sku: "OG2232", name: "OLD PIRATES RULE", color: "Black", tagline: "The Original Ancient Mariner", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 18, cat: "Short Sleeve Tees", sku: "OG2430", name: "CROWS NEST", color: "Gravel", tagline: "Rum-Rye Seeking Booty Nightly", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 18, cat: "Short Sleeve Tees", sku: "OG2324", name: "OLD CRABBY'S", color: "Stone Blue", tagline: "Let's Get Crackin", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 18, cat: "Short Sleeve Tees", sku: "OG2021", name: "BUCKET LIST", color: "Stone Blue", tagline: "Bucket List", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 18, cat: "Short Sleeve Tees", sku: "OG2429", name: "WEATHER STATION", color: "Heather Military Green", tagline: "Coconut Weather Station", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            
            // UPF50 Sun Protection Long Sleeve Shirts
            { page: 18, cat: "Long Sleeve UPF50 Sun Tees", sku: "OG2043-SPF", name: "HOOKIN' UP", color: "Ice Blue", tagline: "Still Hookin' Up - UPF50+ Performance", priceUsd: 18.50, msrpCad: 59.99, isNew: false, isNameDrop: false },
            { page: 18, cat: "Long Sleeve UPF50 Sun Tees", sku: "OG2091-SPF", name: "KEEPIN' IT REAL", color: "Silver", tagline: "Still Keepin It Real - UPF50+ Performance", priceUsd: 18.50, msrpCad: 59.99, isNew: false, isNameDrop: false },
            { page: 18, cat: "Long Sleeve UPF50 Sun Tees", sku: "OG2318-SPF", name: "WAHOO'S YOUR DADDY", color: "Sea Foam", tagline: "Wahoo's Your Daddy - UPF50+ Performance", priceUsd: 18.50, msrpCad: 59.99, isNew: true, isNameDrop: false },
            { page: 19, cat: "Long Sleeve UPF50 Sun Tees", sku: "OG2334-SPF", name: "OLD MEN & THE SEA", color: "Peach", tagline: "Go Big or Go Home - Size Matters - UPF50+", priceUsd: 18.50, msrpCad: 59.99, isNew: false, isNameDrop: false },
            { page: 19, cat: "Long Sleeve UPF50 Sun Tees", sku: "OG2164-SPF", name: "OPV", color: "White", tagline: "On Permanent Vacation - UPF50+ Performance", priceUsd: 18.50, msrpCad: 59.99, isNew: false, isNameDrop: false },
            { page: 19, cat: "Long Sleeve UPF50 Sun Tees", sku: "OG2164-SPF2", name: "CHASING TAIL", color: "Ice Blue", tagline: "Still Chasing Tail - UPF50+ Performance", priceUsd: 18.50, msrpCad: 59.99, isNew: false, isNameDrop: false },

            // Pages 20-21: ANOTHER ROUND / SHORT SLEEVE TEES
            { page: 20, cat: "Short Sleeve Tees", sku: "OG2225", name: "RECOVERING WORKAHOLIC", color: "Sport Grey", tagline: "Recovering Workaholic", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 20, cat: "Short Sleeve Tees", sku: "OG2094", name: "BEER CART", color: "Navy", tagline: "That's How I Roll", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 20, cat: "Short Sleeve Tees", sku: "OG2309", name: "OLD WHISKEY RULES", color: "Black", tagline: "See The World Through Whiskey Glasses", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 20, cat: "Short Sleeve Tees", sku: "OG2427", name: "THIRSTY PARROT", color: "Sport Grey", tagline: "It's 5 O'Clock Somewhere", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 20, cat: "Short Sleeve Tees", sku: "OG2065", name: "BEST ROUND", color: "Navy", tagline: "Best Round Of The Day / 19th Hole", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 21, cat: "Short Sleeve Tees", sku: "OG2023", name: "STILL SWINGING", color: "Stone Blue", tagline: "Still Swinging", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 21, cat: "Short Sleeve Tees", sku: "OG2142", name: "CRAZY BEERS", color: "Indigo Blue", tagline: "Still Crazy After All These Beers", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 21, cat: "Short Sleeve Tees", sku: "OG2251", name: "GLASSES", color: "Graphite Heather", tagline: "At This Age, I Need My Glasses", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 21, cat: "Short Sleeve Tees", sku: "OG2246", name: "UNTAPPED POTENTIAL", color: "Indigo Blue", tagline: "Untapped Potential", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },

            // Pages 22-23: CLUB OGR / SHORT SLEEVE TEES
            { page: 22, cat: "Short Sleeve Tees", sku: "OG0438-3", name: "LOCAL LEGEND", color: "Navy", tagline: "If You Don't Know Me You're Not From Around Here", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 22, cat: "Short Sleeve Tees", sku: "OG2127", name: "LOCAL LEGEND II", color: "Heather Indigo", tagline: "If You Don't Know Me... You're Not From Around Here", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 22, cat: "Short Sleeve Tees", sku: "OG0783", name: "OAK CASK OVAL", color: "Dark Heather", tagline: "Vintage Goods / Aged To Perfection", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 22, cat: "Short Sleeve Tees", sku: "OG2236", name: "GETTING OLDER", color: "Blue Dusk", tagline: "Might Be Getting Older But Refuse To Grow Up", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 23, cat: "Short Sleeve Tees", sku: "OG1113", name: "LEGENDARY BADGE", color: "Blue Dusk", tagline: "A Legend In My Own Mind", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 23, cat: "Short Sleeve Tees", sku: "OG2253", name: "LIVING LEGEND", color: "Charcoal", tagline: "A Legend In My Own Mind", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 23, cat: "Short Sleeve Tees", sku: "OG2527", name: "VINTAGE LABEL", color: "Ice Grey", tagline: "Might Look Young - But I Wasn't Born Yesterday", priceUsd: 13.0, msrpCad: 39.99, isNew: true, isNameDrop: false },
            { page: 23, cat: "Short Sleeve Tees", sku: "OG1161", name: "LOOK GOOD", color: "Heather Military Green", tagline: "It Took Decades To Look This Good", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 23, cat: "Short Sleeve Tees", sku: "OG1154", name: "AGED PERFECTION", color: "Black", tagline: "Aged To Perfection", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 23, cat: "Short Sleeve Tees", sku: "OG1066", name: "BETTER OVAL", color: "Navy", tagline: "The Older I Get - The Better I Was", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },

            // Page 24: GOOD TIMES ROLL / SHORT SLEEVE TEES
            { page: 24, cat: "Short Sleeve Tees", sku: "OG1125", name: "CLASSIC ROCK", color: "Black", tagline: "There's A Reason They Call It 'Classic' Rock", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 24, cat: "Short Sleeve Tees", sku: "OG2231", name: "OLD GUYS ROCK", color: "Black", tagline: "Growing Old Disgracefully", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 24, cat: "Short Sleeve Tees", sku: "OG2024", name: "HOW I ROLL", color: "Gravel", tagline: "This Is How I Roll", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 24, cat: "Short Sleeve Tees", sku: "OG2054", name: "POKER CHIP", color: "Black", tagline: "Still Playing With A Full Deck", priceUsd: 13.0, msrpCad: 39.99, isNew: false, isNameDrop: false },

            // Page 25: SPECIAL ADDITIONS (Long Sleeve, Tanks, Hoodies)
            { page: 25, cat: "Special Additions", sku: "OG0438-3-LS", name: "LOCAL LEGEND LS", color: "Navy", tagline: "Long Sleeve - Left Chest and Right Sleeve Prints", priceUsd: 17.95, msrpCad: 59.99, isNew: false, isNameDrop: false },
            { page: 25, cat: "Special Additions", sku: "OG2521-LS", name: "GOLDEN BADGE LS", color: "White", tagline: "Long Sleeve - Left Chest and Full Back Prints", priceUsd: 17.95, msrpCad: 59.99, isNew: true, isNameDrop: false },
            { page: 25, cat: "Special Additions", sku: "OG1154-LS", name: "AGED TO PERFECTION LS", color: "Black", tagline: "Long Sleeve - Left Chest, Full Back & Right Sleeve", priceUsd: 17.95, msrpCad: 59.99, isNew: false, isNameDrop: false },
            { page: 25, cat: "Special Additions", sku: "OG0438-T", name: "LOCAL LEGEND TANK", color: "Navy Tank", tagline: "Tank Top - Left Chest & Full Back Prints", priceUsd: 14.95, msrpCad: 49.99, isNew: false, isNameDrop: false },
            { page: 25, cat: "Special Additions", sku: "OG0438-ZH", name: "LOCAL LEGEND ZIP HOODIE", color: "Navy Zip Hoodie", tagline: "Zip Hoodie - Left Chest & Full Back Prints", priceUsd: 24.95, msrpCad: 79.99, isNew: false, isNameDrop: false },

            // Pages 26-28: HEADWEAR (Trucker Hats, Dad Caps, Beanies)
            { page: 26, cat: "Headwear", sku: "OG2202", name: "LOCAL LEGEND TRUCKER", color: "Navy/Ivory", tagline: "Twill/Mesh Snapback", priceUsd: 13.50, msrpCad: 44.99, isNew: false, isNameDrop: false },
            { page: 26, cat: "Headwear", sku: "OG2209", name: "OPV TRUCKER", color: "Dusk Blue/Ivory", tagline: "Twill/Mesh Snapback", priceUsd: 13.50, msrpCad: 44.99, isNew: false, isNameDrop: false },
            { page: 26, cat: "Headwear", sku: "OG2207", name: "SIZE MATTERS TRUCKER", color: "Dark Olive/Ivory", tagline: "Twill/Mesh Snapback", priceUsd: 13.50, msrpCad: 44.99, isNew: false, isNameDrop: false },
            { page: 26, cat: "Headwear", sku: "OG2203", name: "AGED PERFECTION TRUCKER", color: "Wine/Ivory", tagline: "Twill/Mesh Snapback", priceUsd: 13.50, msrpCad: 44.99, isNew: false, isNameDrop: false },
            { page: 26, cat: "Headwear", sku: "OG2154", name: "BEAR PATCH TRUCKER", color: "Black Camo/Black", tagline: "Twill/Mesh Snapback", priceUsd: 13.50, msrpCad: 44.99, isNew: false, isNameDrop: false },
            { page: 26, cat: "Headwear", sku: "OG2200", name: "GETTING OLDER TRUCKER", color: "Blue/Black", tagline: "Twill/Mesh Snapback", priceUsd: 13.50, msrpCad: 44.99, isNew: false, isNameDrop: false },
            { page: 26, cat: "Headwear", sku: "OG2152", name: "MARLIN PATCH TRUCKER", color: "Navy/Navy", tagline: "Twill/Mesh Snapback", priceUsd: 13.50, msrpCad: 44.99, isNew: false, isNameDrop: false },
            { page: 26, cat: "Headwear", sku: "OG2428", name: "RUSTY TRUCK TRUCKER", color: "Black", tagline: "Respect The Rust - Twill/Mesh Snapback", priceUsd: 13.50, msrpCad: 44.99, isNew: false, isNameDrop: false },
            { page: 26, cat: "Headwear", sku: "OG2126", name: "ROD & GUN CLUB TRUCKER", color: "Olive Camo/Black", tagline: "Twill/Mesh Snapback", priceUsd: 13.50, msrpCad: 44.99, isNew: false, isNameDrop: false },
            { page: 26, cat: "Headwear", sku: "OG2204", name: "HOOKIN' UP TRUCKER", color: "Grey Mist/Ivory", tagline: "Twill/Mesh Snapback", priceUsd: 13.50, msrpCad: 44.99, isNew: false, isNameDrop: false },
            { page: 26, cat: "Headwear", sku: "OG2155", name: "GOLF CREST TRUCKER", color: "Navy/White", tagline: "Performance Mesh Snapback", priceUsd: 13.50, msrpCad: 44.99, isNew: false, isNameDrop: false },
            { page: 27, cat: "Headwear", sku: "OG0934", name: "BLACK LAB DAD CAP", color: "Stone", tagline: "Back: Ready, Willing And Able", priceUsd: 12.50, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 27, cat: "Headwear", sku: "OG1098", name: "BETTER OVAL DAD CAP", color: "Navy", tagline: "Back: The Older I Get The Better I Was", priceUsd: 12.50, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 27, cat: "Headwear", sku: "OG1004", name: "BORN IN THE USA CAP", color: "Navy & Stone", tagline: "Back: Born In The USA", priceUsd: 12.50, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 27, cat: "Headwear", sku: "OG0309", name: "DIAMOND LOGO CAP", color: "Black", tagline: "Back: The Older I Get The Better I Was", priceUsd: 12.50, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 27, cat: "Headwear", sku: "OG0308", name: "LEGEND BADGE CAP", color: "City Green", tagline: "Back: A Legend In My Own Mind", priceUsd: 12.50, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 27, cat: "Headwear", sku: "OG1165", name: "LOOK GOOD DAD CAP", color: "Dusty Green", tagline: "Back: It Took Decades To Look This Good", priceUsd: 12.50, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 27, cat: "Headwear", sku: "OG0975", name: "CAMO PANELS CAP", color: "Olive & Realtree Camo", tagline: "Back: Bucks, Trucks & Ducks", priceUsd: 12.50, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 28, cat: "Headwear", sku: "OG2038", name: "CHASING TAIL DAD CAP", color: "Navy", tagline: "Back: Still Chasing Tail", priceUsd: 12.50, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 28, cat: "Headwear", sku: "OG0484", name: "REAR VIEW DAD CAP", color: "Slate & Stone", tagline: "Back: Aged To Perfection", priceUsd: 12.50, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 28, cat: "Headwear", sku: "OG2036-S", name: "SHELBY LOGO CAP", color: "Black", tagline: "Back: Aged To Perfection", priceUsd: 12.50, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 28, cat: "Headwear", sku: "OG0805", name: "LOCAL LEGEND DAD CAP", color: "Navy", tagline: "Back: If You Don't Know Me... You're Not From Around Here", priceUsd: 12.50, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 28, cat: "Headwear", sku: "OG0394", name: "V8 DAD CAP", color: "Charcoal", tagline: "Back: High Mileage / Low Maintenance", priceUsd: 12.50, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 28, cat: "Headwear", sku: "OG1166", name: "AUTHORIZED EXPERT CAP", color: "Navy", tagline: "Back: Expert At Everything", priceUsd: 12.50, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 28, cat: "Headwear", sku: "OG1062", name: "IT TOOK DECADES CAP", color: "Slate", tagline: "Back: It Took Decades To Look This Good", priceUsd: 12.50, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 28, cat: "Headwear", sku: "OG2321", name: "GREY KNIT BEANIE", color: "Grey", tagline: "Knit Beanie", priceUsd: 12.00, msrpCad: 39.99, isNew: false, isNameDrop: false },
            { page: 28, cat: "Headwear", sku: "OG2320", name: "BLACK KNIT BEANIE", color: "Black", tagline: "Knit Beanie", priceUsd: 12.00, msrpCad: 39.99, isNew: false, isNameDrop: false },

            // Page 29: DISPLAYS & POP
            { page: 29, cat: "Displays & POP", sku: "002141", name: "WOOD FLOOR DISPLAY", color: "Wood", tagline: "35\"x24\"x78\" Base Footprint (Free with $2800 Order)", priceUsd: 750.00, msrpCad: 0, isNew: false, isNameDrop: false },
            { page: 29, cat: "Displays & POP", sku: "OG2350", name: "4-SIDED ROTATING BIRCH DISPLAY", color: "Birch", tagline: "24\"x24\"x60\" Height (Free with $2800 Order)", priceUsd: 0.00, msrpCad: 0, isNew: false, isNameDrop: false },
            { page: 29, cat: "Displays & POP", sku: "OG2351", name: "4-SIDED ROTATING BLACK DISPLAY", color: "Black", tagline: "24\"x24\"x60\" Height (Free with $2800 Order)", priceUsd: 0.00, msrpCad: 0, isNew: false, isNameDrop: false },
            { page: 29, cat: "Displays & POP", sku: "OG381", name: "14\" POP METAL SIGN - VINTAGE GOODS", color: "Metal", tagline: "14\" Round POP Display Sign (FREE w/ qualified order)", priceUsd: 0.00, msrpCad: 0, isNew: false, isNameDrop: false },
            { page: 29, cat: "Displays & POP", sku: "OG1009", name: "14\" POP METAL SIGN - SOLD HERE", color: "Metal", tagline: "14\" Round POP Display Sign (FREE w/ qualified order)", priceUsd: 0.00, msrpCad: 0, isNew: false, isNameDrop: false },
            { page: 29, cat: "Displays & POP", sku: "OG1014", name: "WINDOW CLING STICKER", color: "Window Cling", tagline: "4\" x 5\" Sold Here Window Cling", priceUsd: 0.00, msrpCad: 0, isNew: false, isNameDrop: false },

            // Pages 30-31: MAGNETS & STICKERS
            { page: 30, cat: "Magnets & Stickers", sku: "OGA2133", name: "IT TOOK DECADES MAGNET", color: "Multi", tagline: "Flex Magnet - Rectangle 4\" x 2.75\"", priceUsd: 2.95, msrpCad: 9.99, isNew: false, isNameDrop: false },
            { page: 30, cat: "Magnets & Stickers", sku: "OGA2132", name: "PERMANENT VACATION MAGNET", color: "Multi", tagline: "Flex Magnet - Oval 4\" x 3\"", priceUsd: 2.95, msrpCad: 9.99, isNew: false, isNameDrop: false },
            { page: 30, cat: "Magnets & Stickers", sku: "OGA2134", name: "PIRATE SKULL MAGNET", color: "Multi", tagline: "Flex Magnet - Rectangle 3.75\" x 3\"", priceUsd: 2.95, msrpCad: 9.99, isNew: false, isNameDrop: false },
            { page: 30, cat: "Magnets & Stickers", sku: "OGA2136", name: "BEST ROUND MAGNET", color: "Multi", tagline: "Flex Magnet - Rectangle 3.75\" x 3\"", priceUsd: 2.95, msrpCad: 9.99, isNew: false, isNameDrop: false },
            { page: 30, cat: "Magnets & Stickers", sku: "OGA2139", name: "TIKI BAR MAGNET", color: "Multi", tagline: "Flex Magnet - Rectangle 3.75\" x 3\"", priceUsd: 2.95, msrpCad: 9.99, isNew: false, isNameDrop: false },
            { page: 30, cat: "Magnets & Stickers", sku: "OGA2140", name: "CLASSIC WOODIE MAGNET", color: "Multi", tagline: "Flex Magnet - Rectangle 3.75\" x 3\"", priceUsd: 2.95, msrpCad: 9.99, isNew: false, isNameDrop: false },
            { page: 30, cat: "Magnets & Stickers", sku: "OGA2138", name: "HAMMOCK VACATION MAGNET", color: "Multi", tagline: "Flex Magnet - Round 3.25\" x 3.25\"", priceUsd: 2.95, msrpCad: 9.99, isNew: false, isNameDrop: false },
            { page: 30, cat: "Magnets & Stickers", sku: "OGA2137", name: "KEEPIN' IT REEL MAGNET", color: "Multi", tagline: "Flex Magnet - Rectangle 3.75\" x 3\"", priceUsd: 2.95, msrpCad: 9.99, isNew: false, isNameDrop: false },
            { page: 30, cat: "Magnets & Stickers", sku: "OGA2135", name: "LEASH MAGNET", color: "Multi", tagline: "Flex Magnet - Rectangle 3.75\" x 3\"", priceUsd: 2.95, msrpCad: 9.99, isNew: false, isNameDrop: false },
            { page: 31, cat: "Magnets & Stickers", sku: "OG2035", name: "ASSORTED STICKERS (25 PK)", color: "Assorted", tagline: "Pack of 25 Assorted Stickers", priceUsd: 25.00, msrpCad: 99.75, isNew: false, isNameDrop: false },
            { page: 31, cat: "Magnets & Stickers", sku: "OG2258", name: "TIKI VACATION STICKERS (25 PK)", color: "Multi", tagline: "4\" Wide - Pack of 25", priceUsd: 25.00, msrpCad: 99.75, isNew: false, isNameDrop: false },
            { page: 31, cat: "Magnets & Stickers", sku: "OG324", name: "REAR VIEW STICKERS (25 PK)", color: "Multi", tagline: "4\" Wide - Pack of 25", priceUsd: 25.00, msrpCad: 99.75, isNew: false, isNameDrop: false },
            { page: 31, cat: "Magnets & Stickers", sku: "OG521", name: "CROWN LOGO STICKERS (25 PK)", color: "Multi", tagline: "3\" Wide - Pack of 25", priceUsd: 25.00, msrpCad: 99.75, isNew: false, isNameDrop: false },
            { page: 31, cat: "Magnets & Stickers", sku: "OG2260", name: "WAVES STICKERS (25 PK)", color: "Multi", tagline: "4\" Wide - Pack of 25", priceUsd: 25.00, msrpCad: 99.75, isNew: false, isNameDrop: false },
            { page: 31, cat: "Magnets & Stickers", sku: "OG525", name: "KING OF ROAD STICKERS (25 PK)", color: "Multi", tagline: "4\" Wide - Pack of 25", priceUsd: 25.00, msrpCad: 99.75, isNew: false, isNameDrop: false },
            { page: 31, cat: "Magnets & Stickers", sku: "OG524", name: "SALTWATER STICKERS (25 PK)", color: "Multi", tagline: "6\" Wide - Pack of 25", priceUsd: 25.00, msrpCad: 99.75, isNew: false, isNameDrop: false },
            { page: 31, cat: "Magnets & Stickers", sku: "OG239", name: "SURFER GUY STICKERS (25 PK)", color: "Multi", tagline: "3.5\" Wide - Pack of 25", priceUsd: 25.00, msrpCad: 99.75, isNew: false, isNameDrop: false },
            { page: 31, cat: "Magnets & Stickers", sku: "OG325", name: "LB LOGO STICKERS (25 PK)", color: "Multi", tagline: "6\" Wide - Pack of 25", priceUsd: 25.00, msrpCad: 99.75, isNew: false, isNameDrop: false },
            { page: 31, cat: "Magnets & Stickers", sku: "OG2259", name: "LOCAL LEGEND STICKERS (25 PK)", color: "Multi", tagline: "5\" Wide - Pack of 25", priceUsd: 25.00, msrpCad: 99.75, isNew: false, isNameDrop: false },
            { page: 31, cat: "Magnets & Stickers", sku: "OG328", name: "LONGBOARD STICKERS (25 PK)", color: "Multi", tagline: "5\" Wide - Pack of 25", priceUsd: 25.00, msrpCad: 99.75, isNew: false, isNameDrop: false },
            { page: 31, cat: "Magnets & Stickers", sku: "OG520", name: "CHECKERED STICKERS (25 PK)", color: "Multi", tagline: "5\" Wide - Pack of 25", priceUsd: 25.00, msrpCad: 99.75, isNew: false, isNameDrop: false },
            { page: 31, cat: "Magnets & Stickers", sku: "OG825", name: "CROWN SCRIPT STICKERS (25 PK)", color: "Multi", tagline: "5\" Wide - Pack of 25", priceUsd: 25.00, msrpCad: 99.75, isNew: false, isNameDrop: false },

            // Page 32: GIFTWARE & DRINKWARE
            { page: 32, cat: "Giftware", sku: "OGA-M18", name: "VINTAGE BREW CERAMIC MUG", color: "Black Ceramic", tagline: "15 oz Ceramic Coffee Mug", priceUsd: 8.95, msrpCad: 29.99, isNew: false, isNameDrop: false },
            { page: 32, cat: "Giftware", sku: "OGA-M438", name: "LOCAL LEGEND CERAMIC MUG", color: "Cobalt Ceramic", tagline: "15 oz Ceramic Coffee Mug", priceUsd: 8.95, msrpCad: 29.99, isNew: false, isNameDrop: false },
            { page: 32, cat: "Giftware", sku: "OGA-M1066", name: "BETTER OVAL CERAMIC MUG", color: "Navy Ceramic", tagline: "15 oz Ceramic Coffee Mug", priceUsd: 8.95, msrpCad: 29.99, isNew: false, isNameDrop: false },
            { page: 32, cat: "Giftware", sku: "OGA-M957", name: "REFUSE TO GROW UP MUG", color: "White Ceramic", tagline: "15 oz Ceramic Coffee Mug", priceUsd: 8.95, msrpCad: 29.99, isNew: false, isNameDrop: false },
            { page: 32, cat: "Giftware", sku: "OGA-2322", name: "WHISKEY GLASS BOX SET", color: "Clear Glass / Gift Box", tagline: "2-Piece Heavy Base Whiskey Glass Box Set", priceUsd: 10.00, msrpCad: 34.99, isNew: false, isNameDrop: false },

            // Page 33: BEVERAGE SUPPORT
            { page: 33, cat: "Giftware", sku: "OGA-0040", name: "LOCAL LEGEND CAN COOLER (6-PK)", color: "Blue Neoprene", tagline: "Pack of 6 Neoprene Can Coolers ($4.99 ea)", priceUsd: 29.94, msrpCad: 89.94, isNew: false, isNameDrop: false },
            { page: 33, cat: "Giftware", sku: "OGA-0039", name: "CHASING TAIL CAN COOLER (6-PK)", color: "Blue Neoprene", tagline: "Pack of 6 Neoprene Can Coolers ($4.99 ea)", priceUsd: 29.94, msrpCad: 89.94, isNew: false, isNameDrop: false },
            { page: 33, cat: "Giftware", sku: "OGA-0042", name: "IT TOOK DECADES CAN COOLER (6-PK)", color: "Blue Neoprene", tagline: "Pack of 6 Neoprene Can Coolers ($4.99 ea)", priceUsd: 29.94, msrpCad: 89.94, isNew: false, isNameDrop: false },
            { page: 33, cat: "Giftware", sku: "OGA-0041", name: "V8 CAN COOLER (6-PK)", color: "Black Neoprene", tagline: "Pack of 6 Neoprene Can Coolers ($4.99 ea)", priceUsd: 29.94, msrpCad: 89.94, isNew: false, isNameDrop: false },
            { page: 33, cat: "Giftware", sku: "OGA-0037", name: "BEER LABEL CAN COOLER (6-PK)", color: "Black Neoprene", tagline: "Pack of 6 Neoprene Can Coolers ($4.99 ea)", priceUsd: 29.94, msrpCad: 89.94, isNew: false, isNameDrop: false },
            { page: 33, cat: "Giftware", sku: "OGA-0038", name: "WAVES CAN COOLER (6-PK)", color: "Black Neoprene", tagline: "Pack of 6 Neoprene Can Coolers ($4.99 ea)", priceUsd: 29.94, msrpCad: 89.94, isNew: false, isNameDrop: false },
            { page: 33, cat: "Giftware", sku: "OGA-2316", name: "FLAT-FOLD CAN COOLERS 2-PK", color: "Navy & Camo", tagline: "Flat-Fold Can Coolers 2-Pack", priceUsd: 4.50, msrpCad: 14.99, isNew: false, isNameDrop: false },
            { page: 33, cat: "Giftware", sku: "OGA-2156", name: "WALL MOUNTED BOTTLE OPENER", color: "Black Cast Metal", tagline: "Still Crazy After All These Beers Wall Opener", priceUsd: 8.75, msrpCad: 29.99, isNew: false, isNameDrop: false },

            // Pages 34-35: VINTAGE METAL SIGNS
            { page: 34, cat: "Vintage Metal Signs", sku: "OGA014", name: "BLUE TRUCK METAL SIGN", color: "Heavy Steel", tagline: "18\" x 12\" Rectangle - Blue Truck Graphic", priceUsd: 15.50, msrpCad: 49.99, isNew: false, isNameDrop: false },
            { page: 34, cat: "Vintage Metal Signs", sku: "OGA005", name: "RUSTY TRUCK METAL SIGN", color: "Heavy Steel", tagline: "12\" x 12\" Square - Respect The Rust", priceUsd: 13.50, msrpCad: 44.99, isNew: false, isNameDrop: false },
            { page: 34, cat: "Vintage Metal Signs", sku: "OGA007", name: "PANHEAD METAL SIGN", color: "Heavy Steel", tagline: "18\" x 12\" Rectangle - Loud, Fast, Built To Last", priceUsd: 15.50, msrpCad: 49.99, isNew: false, isNameDrop: false },
            { page: 34, cat: "Vintage Metal Signs", sku: "OGA010-GM", name: "AMER. AS IT GETS METAL SIGN", color: "Heavy Steel", tagline: "12\" x 18\" Rectangle - Chevy Trucks As American As It Gets", priceUsd: 15.50, msrpCad: 49.99, isNew: false, isNameDrop: true },
            { page: 34, cat: "Vintage Metal Signs", sku: "OGA011", name: "WRENCHES METAL SIGN", color: "Heavy Steel", tagline: "14\" x 14\" Round - Expert At Everything... Just Ask Me", priceUsd: 15.50, msrpCad: 49.99, isNew: false, isNameDrop: false },
            { page: 34, cat: "Vintage Metal Signs", sku: "OGA008-S", name: "SHELBY GT350 METAL SIGN", color: "Heavy Steel", tagline: "12\" x 18\" Rectangle - Shelby GT350", priceUsd: 15.50, msrpCad: 49.99, isNew: false, isNameDrop: false },
            { page: 35, cat: "Vintage Metal Signs", sku: "OGA001", name: "KEEPIN' IT REEL METAL SIGN", color: "Heavy Steel", tagline: "12\" x 12\" Square - Still Keepin' It Reel", priceUsd: 13.50, msrpCad: 44.99, isNew: false, isNameDrop: false },
            { page: 35, cat: "Vintage Metal Signs", sku: "OGA003", name: "BEST ROUND METAL SIGN", color: "Heavy Steel", tagline: "12\" x 12\" Square - Best Round Of The Day / 19th Hole", priceUsd: 13.50, msrpCad: 44.99, isNew: false, isNameDrop: false },
            { page: 35, cat: "Vintage Metal Signs", sku: "OGA013", name: "TIKI BAR METAL SIGN", color: "Heavy Steel", tagline: "12\" x 12\" Square - Always 5 O'Clock", priceUsd: 13.50, msrpCad: 44.99, isNew: false, isNameDrop: false },
            { page: 35, cat: "Vintage Metal Signs", sku: "OGA004", name: "PIRATE SKULL METAL SIGN", color: "Heavy Steel", tagline: "12\" x 12\" Square - Old Guys Tell Great Tales", priceUsd: 13.50, msrpCad: 44.99, isNew: false, isNameDrop: false },
            { page: 35, cat: "Vintage Metal Signs", sku: "OGA012", name: "BAIT & TACKLE METAL SIGN", color: "Heavy Steel", tagline: "14\" x 14\" Round - Everything You Need To Hook Up!", priceUsd: 15.50, msrpCad: 49.99, isNew: false, isNameDrop: false },
];
