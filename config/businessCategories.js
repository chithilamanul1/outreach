/**
 * Seranex Lanka Solutions - Business Verticals, Target Industries & Geographic Regions
 * Unified Growth Engine for:
 * 1. Software Development (Web/Mobile Apps, CRM, ERP, POS, Booking & Automation)
 * 2. Website Design & Development (Modern, Fast, E-commerce, SEO, 1-2 Day Delivery)
 * 3. Video Advertisement & Digital Marketing Agency (4K Commercials, Viral Reels/TikTok, Meta & Google Ads)
 */

export const AGENCY_PROFILE = {
  name: "Seranex Lanka Solutions",
  shortName: "Seranex Solutions",
  tagline: "Custom Software • High-Converting Websites • Cinematic Video Ads & Marketing",
  website: "https://seranex.lk",
  portfolioUrl: "https://seranex.lk",
  bookingUrl: "https://seranex.lk",
  contactEmail: process.env.EMAIL_FROM || process.env.SMTP_USER || "sales@seranex.lk",
  hotline: "0728382638",
  hotlineIntl: "+94 72 838 2638",
  adminWhatsApp: process.env.ADMIN_WHATSAPP_NUMBER || "94728382638",
  pricing: {
    websiteStarterUSD: 100,
    websiteStarterLKR: 28000,
    softwareBespokeUSD: 250,
    videoAdBundleUSD: 150
  }
};

export const CORE_SERVICES = {
  website: {
    id: "website",
    name: "Website Design & Development",
    icon: "fa-globe",
    badgeColor: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    description: "Ultra-fast, mobile-responsive, SEO-optimized business websites & e-commerce stores delivered in 1-2 days.",
    deliverables: [
      "Custom responsive design (Mobile, Tablet, Desktop)",
      "Domain name & high-speed SSD cloud hosting for 1 year included",
      "Direct WhatsApp & click-to-call conversion buttons (0728382638)",
      "Google Maps & Local SEO indexing",
      "Lead generation contact form & analytics",
      "Social media and menu/catalog integration"
    ]
  },
  software: {
    id: "software",
    name: "Custom Software & Web Applications",
    icon: "fa-code",
    badgeColor: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    description: "Bespoke business management systems, POS, CRM, booking engines, inventory, and workflow automation.",
    deliverables: [
      "Online Table / Room / Appointment Booking Engine",
      "Inventory management & POS software",
      "Customer Relationship Management (CRM) & Lead Pipeline",
      "Staff & billing management dashboards",
      "Automated WhatsApp & Email customer notifications",
      "Third-party API integrations (Payment gateways, Google Calendar, etc.)"
    ]
  },
  video_marketing: {
    id: "video_marketing",
    name: "Video Ads & Digital Marketing",
    icon: "fa-video",
    badgeColor: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    description: "Cinematic 4K commercial videos, high-engagement TikTok/Instagram Reels, and ROI-driven Meta/Google Ads.",
    deliverables: [
      "High-converting 4K promotional commercial video",
      "3-5 viral Instagram Reels / TikTok short-form video ads",
      "Meta Ads (Facebook & Instagram) targeted campaign setup",
      "Google Search & Google Maps local ranking optimization",
      "Ad copy, target audience profiling, and A/B split testing",
      "Weekly analytics & real paying customer lead tracking"
    ]
  },
  growth_bundle: {
    id: "growth_bundle",
    name: "Seranex 360° Growth Suite",
    icon: "fa-rocket",
    badgeColor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    description: "Complete all-in-one digital transformation: New High-Speed Website + Custom Booking/CRM Software + Viral Video Ads.",
    deliverables: [
      "Full Business Website with custom domain & hosting",
      "Automated customer booking / ordering system",
      "2x Cinematic Video Ads for Reels & TikTok",
      "Meta Ads campaign launch with dedicated ad spend optimization",
      "VIP 24/7 dedicated sales & account manager support"
    ]
  }
};

export const BUSINESS_VERTICALS = {
  restaurants: {
    id: "restaurants",
    name: "Restaurants, Cafes & Food",
    icon: "fa-utensils",
    defaultService: "growth_bundle",
    searchKeywords: [
      "restaurant in",
      "cafe in",
      "family restaurant in",
      "seafood restaurant in",
      "bistro and bar in",
      "bakery and cafe in"
    ],
    pitchAngle: "Eliminate 25-30% food delivery app commissions with your own direct WhatsApp ordering website, plus viral Instagram food reels to pack your tables every weekend."
  },
  hospitality: {
    id: "hospitality",
    name: "Hotels, Resorts & Villas",
    icon: "fa-hotel",
    defaultService: "software",
    searchKeywords: [
      "boutique hotel in",
      "luxury villa in",
      "beach resort in",
      "tour operator in",
      "guesthouse in"
    ],
    pitchAngle: "Stop losing 18-22% OTA commissions on Booking.com/Agoda. We build your direct commission-free booking website, virtual room tour video ads, and guest management system."
  },
  healthcare: {
    id: "healthcare",
    name: "Clinics, Dental & Wellness Spas",
    icon: "fa-hospital",
    defaultService: "software",
    searchKeywords: [
      "dental clinic in",
      "medical clinic in",
      "wellness spa in",
      "ayurvedic clinic in",
      "cosmetic clinic in",
      "physiotherapy center in"
    ],
    pitchAngle: "A seamless patient online appointment booking system combined with trust-building video walkthroughs to attract high-paying local and international clients."
  },
  realestate: {
    id: "realestate",
    name: "Real Estate & Architecture",
    icon: "fa-building",
    defaultService: "video_marketing",
    searchKeywords: [
      "real estate agency in",
      "property developers in",
      "luxury apartments in",
      "architect in",
      "interior design studio in"
    ],
    pitchAngle: "Cinematic 4K property walkthrough video ads for Meta/Google Ads, paired with a high-converting property listing portal and buyer CRM."
  },
  retail: {
    id: "retail",
    name: "Retail, Boutiques & E-commerce",
    icon: "fa-shopping-bag",
    defaultService: "website",
    searchKeywords: [
      "clothing boutique in",
      "jewelry store in",
      "electronics store in",
      "organic store in",
      "furniture showroom in"
    ],
    pitchAngle: "Turn your local storefront into a 24/7 online e-commerce powerhouse with one-click payment checkout and product showcase video ads on TikTok and Instagram."
  },
  fitness: {
    id: "fitness",
    name: "Gyms, Fitness & Sports Centers",
    icon: "fa-dumbbell",
    defaultService: "video_marketing",
    searchKeywords: [
      "gym in",
      "fitness center in",
      "crossfit gym in",
      "yoga studio in",
      "martial arts academy in"
    ],
    pitchAngle: "High-energy workout video ads for Instagram and TikTok that flood your gym with new memberships, backed by an automated class booking system."
  },
  services: {
    id: "services",
    name: "Corporate & Professional Services",
    icon: "fa-briefcase",
    defaultService: "website",
    searchKeywords: [
      "law firm in",
      "accounting firm in",
      "education institute in",
      "visa consultancy in",
      "logistics company in"
    ],
    pitchAngle: "An authoritative corporate website, client intake automation, and Google Search Ads to capture high-intent clients searching for your expertise."
  }
};

export const TARGET_REGIONS = {
  sri_lanka: {
    group: "Sri Lanka Commercial Hubs",
    cities: [
      "Colombo",
      "Negombo",
      "Kandy",
      "Galle",
      "Gampaha",
      "Seeduwa",
      "Ja-Ela",
      "Kurunegala",
      "Matara",
      "Jaffna",
      "Ella",
      "Nuwara Eliya",
      "Mirissa",
      "Bentota",
      "Batticaloa"
    ]
  },
  international: {
    group: "Global High-Value Hubs",
    cities: [
      "Dubai, UAE",
      "Abu Dhabi, UAE",
      "London, UK",
      "Sydney, Australia",
      "Melbourne, Australia",
      "Singapore",
      "Toronto, Canada",
      "New York, USA",
      "Miami, USA",
      "Auckland, New Zealand"
    ]
  }
};
