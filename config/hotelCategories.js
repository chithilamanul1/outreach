/**
 * Hotel Star Categories and Sri Lanka Tourist Locations
 * Configured specifically for B2B Travel Agency Rate Sheet Gathering
 */

export const STAR_CATEGORIES = {
  "4-star": {
    id: "4-star",
    name: "4-Star Hotels",
    starRating: 4,
    badge: "⭐⭐⭐⭐",
    folder: "4_star",
    priority: 1, // Primary Travel Agency inventory
    maxPerLocation: 15,
    searchQueries: [
      "4 star hotel",
      "four star hotel",
      "4 star luxury resort",
      "4 star boutique hotel",
      "4 star beach resort"
    ]
  },
  "3-star": {
    id: "3-star",
    name: "3-Star Hotels",
    starRating: 3,
    badge: "⭐⭐⭐",
    folder: "3_star",
    priority: 2, // Primary Travel Agency inventory
    maxPerLocation: 15,
    searchQueries: [
      "3 star hotel",
      "three star hotel",
      "3 star beach resort",
      "3 star boutique hotel",
      "3 star resort"
    ]
  },
  "5-star": {
    id: "5-star",
    name: "5-Star Hotels",
    starRating: 5,
    badge: "⭐⭐⭐⭐⭐",
    folder: "5_star",
    priority: 3, // Capped: only 1-2 premier 5-star hotels per destination
    maxPerLocation: 2,
    searchQueries: [
      "5 star luxury hotel",
      "5 star resort"
    ]
  }
};

export const SRI_LANKA_REGIONS = [
  // Commercial & Western Hubs
  "Colombo",
  "Negombo",
  "Mount Lavinia",
  "Wadduwa",
  "Kalutara",

  // South & South-West Coast (Peak season: Nov - April)
  "Bentota",
  "Beruwala",
  "Hikkaduwa",
  "Galle",
  "Unawatuna",
  "Koggala",
  "Ahangama",
  "Weligama",
  "Mirissa",
  "Tangalle",
  "Hambantota",

  // Central Highlands & Tea Country
  "Kandy",
  "Nuwara Eliya",
  "Ella",
  "Bandarawela",
  "Hatton",

  // Cultural Triangle & Heritage
  "Sigiriya",
  "Dambulla",
  "Habarana",
  "Anuradhapura",
  "Polonnaruwa",

  // Wildlife & Safari Hubs
  "Yala",
  "Tissamaharama",
  "Udawalawe",
  "Wilpattu",

  // East Coast (Peak season: May - Oct)
  "Trincomalee",
  "Nilaveli",
  "Pasikuda",
  "Arugam Bay",

  // North & North-West
  "Jaffna",
  "Kalpitiya"
];
