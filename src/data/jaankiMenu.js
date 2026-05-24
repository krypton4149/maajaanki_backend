/**
 * Maa Jaanki Restaurant menu — structured for WhatsApp (plain text, readable on mobile).
 * Row titles must stay ≤24 chars for WhatsApp list messages.
 */

const { formatCategoryHeader } = require("../utils/menuMessageFormat");
const { deliveryPolicyLine } = require("../utils/deliveryCharge");

const line = (c = "─") => c.repeat(22);

const header = (title) => {
  const plain = String(title).replace(/^[🍽️🟢]\s*/, "").replace(/\*/g, "").trim();
  const name = plain.replace(/^[^\w]*\s*/, "").trim() || title;
  return formatCategoryHeader(name).trimEnd();
};

const priced = (name, price) => `• ${name} — ${price}`;

const MENU_SECTIONS = [
  {
    id: "thalis",
    listTitle: "Thalis",
    listDescription: "Special & deluxe platters",
    format() {
      return [
        header("🍱 THALIS"),
        "",
        "▸ Jaanki Special Thali — ₹560",
        "  Includes:",
        "  • Kaju Masala",
        "  • Paneer Gravy",
        "  • Dal Makhni",
        "  • Mix Veg",
        "  • Kashmiri Pulav",
        "  • 1 Lacchha Paratha",
        "  • 1 Stuffed Naan",
        "  • 1 Missi Roti",
        "  • Shahi Tukda / Gulab Jamun",
        "",
        "▸ Deluxe Thali — ₹360",
        "  Includes:",
        "  • Paneer Gravy",
        "  • Dal Fry",
        "  • Mix Veg",
        "  • Jeera Rice",
        "  • 1 Lacchha Paratha",
        "  • 1 Butter Naan",
        "  • Gulab Jamun",
        "",
        `${line()}`,
        "Reply MENU anytime for categories.",
      ].join("\n");
    },
  },
  {
    id: "bread",
    listTitle: "Bread Basket",
    listDescription: "Roti, naan & more",
    format() {
      const items = [
        ["Plain Roti", "₹25"],
        ["Butter Roti", "₹30"],
        ["Lacchha Paratha", "₹65"],
        ["Missi Roti", "₹65"],
        ["Missi Masala Roti", "₹75"],
        ["Plain Naan", "₹65"],
        ["Butter Naan", "₹85"],
        ["Garlic Naan", "₹95"],
        ["Cheese Garlic Naan", "₹115"],
        ["Stuffed Naan", "₹115"],
        ["Paneer Stuffed Naan", "₹149"],
        ["Kabuli Naan", "₹135"],
        ["Stuffed Kulcha", "₹125"],
        ["Paneer Kulcha", "₹145"],
        ["Kashmiri Naan", "₹145"],
        ["Soya Keema Naan (Spicy)", "₹165"],
        ["Mughlai Khamiri Roti", "₹135"],
        ["Green Chilli Lacchha Paratha", "₹65"],
      ];
      return [
        header("🫓 BREAD BASKET"),
        "",
        ...items.map(([n, p]) => priced(n, p)),
        "",
        `${line()}`,
        "Reply MENU for more sections.",
      ].join("\n");
    },
  },
  {
    id: "rice",
    listTitle: "Rice",
    listDescription: "Steamed, pulav & biryani",
    format() {
      const items = [
        ["Steamed Rice", "₹210"],
        ["Jeera Rice", "₹225"],
        ["Veg Pulav", "₹245"],
        ["Matar Pulav", "₹290"],
        ["Paneer Pulav", "₹295"],
        ["Kashmiri Pulav", "₹320"],
        ["Veg Biryani", "₹340"],
        ["Veg Hyderabadi Biryani", "₹365"],
      ];
      return [
        header("🍚 RICE"),
        "",
        ...items.map(([n, p]) => priced(n, p)),
        "",
        `${line()}`,
        "Reply MENU for more sections.",
      ].join("\n");
    },
  },
  {
    id: "south",
    listTitle: "South Indian",
    listDescription: "Dosa, uttapam & more",
    format() {
      const items = [
        ["Plain Butter Dosa", "₹130"],
        ["Plain Paper Dosa", "₹145"],
        ["Chocolate Paper Dosa", "₹149"],
        ["Schezwan Paper Dosa", "₹149"],
        ["Masala Dosa", "₹180"],
        ["Paneer Masala Dosa", "₹260"],
        ["Cheese Masala Dosa", "₹260"],
        ["Mysore Masala Dosa", "₹255"],
        ["Hungama Mysore Dosa", "₹310"],
        ["Ghotala Mysore Dosa", "₹299"],
        ["Jaanki Special Matki Dosa", "₹360"],
        ["Jini Roll Dosa", "₹299"],
        ["Spring Roll Dosa", "₹299"],
        ["Cheese Chilli Dosa", "₹250"],
        ["Plain Uttapam", "₹180"],
        ["Uttapam (Onion/Tomato/Veg)", "₹199"],
        ["Kashmiri Uttapam", "₹250"],
        ["Idli Sambhar", "₹180"],
        ["Masala Idli", "₹180"],
        ["Medu Vada", "₹190"],
        ["Curd Rice", "₹160"],
        ["Lemon Rice", "₹160"],
      ];
      return [
        header("🥘 SOUTH INDIAN DELICACIES"),
        "",
        ...items.map(([n, p]) => priced(n, p)),
        "",
        `${line()}`,
        "Reply MENU for more sections.",
      ].join("\n");
    },
  },
  {
    id: "chinese",
    listTitle: "Chinese (Dry)",
    listDescription: "Starters & dry dishes",
    format() {
      const items = [
        ["Veg Manchurian Dry", "₹365"],
        ["Paneer Manchurian Dry", "₹385"],
        ["Gobhi Manchurian Dry", "₹365"],
        ["Chilli Paneer Dry", "₹395"],
        ["Chilli Mushroom Dry", "₹385"],
        ["Chilli Babycorn Dry", "₹385"],
        ["Chilli Soya Chaap Dry", "₹360"],
        ["Sweet Chilli Cauliflower Dry", "₹355"],
        ["Corn Salt and Peppers", "₹295"],
        ["Chilli Soyabean Dry", "₹295"],
        ["Paneer 65", "₹395"],
        ["Aloo 65", "₹395"],
      ];
      return [
        header("🥡 CHINESE"),
        "",
        ...items.map(([n, p]) => priced(n, p)),
        "",
        `${line()}`,
        "Reply MENU for more sections.",
      ].join("\n");
    },
  },
  {
    id: "noodles",
    listTitle: "Noodles & Rice",
    listDescription: "Hakka, fried rice & more",
    format() {
      const items = [
        ["Veg Hakka Noodles", "₹185"],
        ["Schezwan Noodles", "₹195"],
        ["Chilli Garlic Noodles", "₹199"],
        ["Veg Chowmein", "₹190"],
        ["Singapore Noodles", "₹199"],
        ["Jaanki Special Spicy Noodles", "₹225"],
        ["Veg Fried Rice", "₹245"],
        ["Schezwan Fried Rice", "₹275"],
        ["Singapore Fried Rice", "₹270"],
        ["Mexican Fried Rice", "₹285"],
        ["Jaanki Special Fried Rice", "₹295"],
      ];
      return [
        header("🍜 NOODLES & RICE"),
        "",
        ...items.map(([n, p]) => priced(n, p)),
        "",
        `${line()}`,
        "Reply MENU for more sections.",
      ].join("\n");
    },
  },
  {
    id: "tandoori",
    listTitle: "Tandoori",
    listDescription: "Tikka, kebabs & platter",
    format() {
      const items = [
        ["Hara Bhara Kababs", "₹195"],
        ["Dahi ke Kababs", "₹299"],
        ["Dahi ke Sholay", "₹310"],
        ["Paneer Tikka", "₹465"],
        ["Paneer Malai Tikka", "₹479"],
        ["Mushroom Tikka", "₹465"],
        ["Hariyali Paneer Tikka", "₹489"],
        ["Soya Chaap Tikka", "₹349"],
        ["Soya Chaap Malai Tikka", "₹349"],
        ["Soya Chaap Hariyali Tikka", "₹479"],
        ["Tandoori Aloo Nazakat", "₹465"],
        ["Tandoori Mushroom Paneer Roll Tikka", "₹480"],
        ["Hariyali Paneer Roll Tikka", "₹480"],
        ["Kimchi Kabab (Seasonal)", "₹415"],
        ["Stuffed Paneer Tikka", "₹449"],
        ["Jaanki Special Tandoori Platter", "₹525"],
      ];
      return [
        header("🔥 TANDOORI"),
        "",
        ...items.map(([n, p]) => priced(n, p)),
        "",
        `${line()}`,
        "Reply MENU for more sections.",
      ].join("\n");
    },
  },
  {
    id: "chinese_gravy",
    listTitle: "Chinese gravy",
    listDescription: "Main course gravies",
    format() {
      const items = [
        ["Chilli Paneer Gravy", "₹399"],
        ["Veg Manchurian Gravy", "₹370"],
        ["Baby Corn Mushroom in Hot Garlic Sauce", "₹385"],
        ["American Chopsuey (Sweet/Sour)", "₹410"],
        ["Veg Spicy Chopsuey", "₹390"],
        ["Chilli Soybean Gravy", "₹385"],
        ["Paneer Manchurian Gravy", "₹410"],
      ];
      return [
        header("🥡 CHINESE MAIN COURSE"),
        "",
        ...items.map(([n, p]) => priced(n, p)),
        "",
        `${line()}`,
        "Reply MENU for more sections.",
      ].join("\n");
    },
  },
  {
    id: "pasta_pizza",
    listTitle: "Pasta & Pizza",
    listDescription: "Italian favourites",
    format() {
      const items = [
        ["Pasta (Alfredo Sauce)", "₹310"],
        ["Pasta (Arrabbiata Sauce)", "₹290"],
        ["Pasta (Pesto Sauce)", "₹320"],
        ["Pasta (Pink Sauce)", "₹299"],
        ["Baked Mac & Cheese", "₹340"],
        ["Baked Lasagna", "₹360"],
        ["Spaghetti", "₹299"],
        ["Margherita Pizza", "₹290"],
        ["Herby Italian Pizza", "₹299"],
        ["Country Feast Pizza", "₹380"],
        ["Smoked Tandoori Pizza", "₹410"],
        ["Mexican Wave Pizza", "₹349"],
        ["Onion Capsicum Pizza", "₹349"],
        ["Golden Corn Pizza", "₹440"],
        ["Jaanki Special Pizza", "₹510"],
      ];
      return [
        header("🍕 PASTA / PIZZA HOUSE"),
        "",
        ...items.map(([n, p]) => priced(n, p)),
        "",
        `${line()}`,
        "Reply MENU for more sections.",
      ].join("\n");
    },
  },
  {
    id: "indian",
    listTitle: "Indian mains",
    listDescription: "Dal, paneer & curries",
    format() {
      const items = [
        ["Dal Tadka", "₹295"],
        ["Dal Fry", "₹280"],
        ["Dal Panchratan", "₹335"],
        ["Dal Makhani", "₹335"],
        ["Aloo Jeera", "₹195"],
        ["Aloo Achari", "₹215"],
        ["Stuffed Shimla Mirch", "₹260"],
        ["Stuffed Tomato", "₹260"],
        ["Aloo Gobhi Matar (Dry)", "₹190"],
        ["Mix Veg Dry", "₹325"],
        ["Veg Jalfrezi", "₹325"],
        ["Veg Jaipuri", "₹325"],
        ["Veg Kofta", "₹375"],
        ["Malai Kofta", "₹425"],
        ["Shaam Savera Kofta", "₹410"],
        ["Kashmiri Dum Aloo", "₹435"],
        ["Punjabi Dum Aloo", "₹435"],
        ["Mushroom Masala", "₹430"],
        ["Mushroom Tikka Masala", "₹445"],
        ["Kadhai Mushroom", "₹445"],
        ["Mushroom Afghani Gravy", "₹295"],
        ["Paneer Do Pyaza", "₹425"],
        ["Kadhai Paneer", "₹425"],
        ["Paneer Butter Masala", "₹425"],
        ["Paneer Lababdar", "₹425"],
        ["Palak Paneer", "₹425"],
        ["Lahsuni Corn Palak", "₹415"],
        ["Matar Paneer", "₹425"],
        ["Paneer Tikka Masala", "₹485"],
        ["Paneer Rogan Josh", "₹510"],
        ["Shahi Paneer (White Gravy)", "₹430"],
      ];
      return [
        header("🍛 INDIAN MAIN COURSE"),
        "",
        ...items.map(([n, p]) => priced(n, p)),
        "",
        `${line()}`,
        "Reply MENU for more sections.",
      ].join("\n");
    },
  },
];

function getSectionById(id) {
  return MENU_SECTIONS.find((s) => s.id === id);
}

function getWelcomeBody() {
  return [
    "Namaste 🙏 Welcome to Maa Jaanki Restaurant.",
    "",
    deliveryPolicyLine(),
    "",
    "🍽️ Tap Browse menu → pick a category → add items",
    "   Example: 2 x Veg Momos",
    "",
    "🛒 Type CART when ready",
    "   → Apply coupon · Checkout · Pay (COD / UPI)",
    "",
    "Your cart is saved when you browse more categories.",
  ].join("\n");
}

module.exports = {
  MENU_SECTIONS,
  getSectionById,
  getWelcomeBody,
  BRAND_NAME: "Maa Jaanki Restaurant",
};
