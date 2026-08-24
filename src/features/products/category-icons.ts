/**
 * The curated category icon set.
 *
 * Stored value is the `key`, never the emoji itself. An emoji glyph is not a
 * stable identifier — it renders differently per platform, and a future move to
 * a drawn icon set would orphan every stored character. A key survives that:
 * the glyph is a rendering detail this file owns.
 *
 * `keywords` exist because a shopkeeper searches for what they sell, not for
 * what we named the icon. Someone typing "chemist", "drugstore" or "pharmacy"
 * must all land on the same icon, and someone typing "pop" or "soda" must find
 * soft drinks. The keywords carry regional and colloquial words on purpose —
 * that is what makes the search usable outside the vocabulary we happened to
 * pick. Labels stay plain English; the keywords do the reaching.
 *
 * The set is deliberately broad — grocery, restaurant, fashion, hardware,
 * pharmacy, electronics, agriculture, services, and the long tail — because a
 * picker that does not have your category is a picker you abandon.
 */
export interface CategoryIcon {
  key: string
  emoji: string
  label: string
  group: string
  keywords: string[]
}

export const ICON_GROUPS = [
  'Food & grocery',
  'Drinks',
  'Bakery & sweets',
  'Prepared food',
  'Household',
  'Personal care',
  'Health & pharmacy',
  'Fashion',
  'Electronics',
  'Appliances',
  'Home & furniture',
  'Hardware & building',
  'Automotive',
  'Agriculture',
  'Office & school',
  'Toys & baby',
  'Sports & outdoors',
  'Pets',
  'Services',
  'Digital & telecom',
  'Gifts & occasions',
  'Hobbies & culture',
  'Shop shelves',
] as const

export const CATEGORY_ICONS: CategoryIcon[] = [
  // ---- Food & grocery -------------------------------------------------------
  { key: 'bread', emoji: '🍞', label: 'Bread', group: 'Food & grocery', keywords: ['loaf', 'bakery', 'sliced', 'agege', 'baguette', 'toast', 'roti', 'pan'] },
  { key: 'rice', emoji: '🍚', label: 'Rice', group: 'Food & grocery', keywords: ['grain', 'basmati', 'jasmine', 'long grain', 'staple'] },
  { key: 'grains', emoji: '🌾', label: 'Grains & cereals', group: 'Food & grocery', keywords: ['wheat', 'corn', 'maize', 'millet', 'sorghum', 'barley', 'oats', 'staples'] },
  { key: 'noodles', emoji: '🍜', label: 'Noodles', group: 'Food & grocery', keywords: ['instant', 'ramen', 'indomie', 'spaghetti', 'macaroni', 'vermicelli'] },
  { key: 'pasta', emoji: '🍝', label: 'Pasta', group: 'Food & grocery', keywords: ['spaghetti', 'macaroni', 'penne', 'italian'] },
  { key: 'flour', emoji: '🌾', label: 'Flour & baking', group: 'Food & grocery', keywords: ['baking', 'yeast', 'semolina', 'cassava', 'dough', 'cornflour'] },
  { key: 'beans', emoji: '🫘', label: 'Beans & legumes', group: 'Food & grocery', keywords: ['pulses', 'lentils', 'chickpeas', 'peas', 'soy', 'protein'] },
  { key: 'vegetables', emoji: '🥬', label: 'Vegetables', group: 'Food & grocery', keywords: ['greens', 'produce', 'veg', 'salad', 'leaf', 'fresh'] },
  { key: 'tomato', emoji: '🍅', label: 'Tomatoes & peppers', group: 'Food & grocery', keywords: ['pepper', 'chilli', 'paste', 'puree', 'stew'] },
  { key: 'fruit', emoji: '🍎', label: 'Fruit', group: 'Food & grocery', keywords: ['fresh', 'produce', 'apple', 'orange', 'mango', 'banana'] },
  { key: 'tubers', emoji: '🥔', label: 'Tubers & roots', group: 'Food & grocery', keywords: ['potato', 'yam', 'cassava', 'sweet potato', 'ginger', 'onion'] },
  { key: 'meat', emoji: '🥩', label: 'Meat', group: 'Food & grocery', keywords: ['beef', 'butcher', 'goat', 'lamb', 'pork', 'steak', 'protein'] },
  { key: 'poultry', emoji: '🍗', label: 'Poultry', group: 'Food & grocery', keywords: ['chicken', 'turkey', 'duck', 'wings', 'drumstick'] },
  { key: 'fish', emoji: '🐟', label: 'Fish & seafood', group: 'Food & grocery', keywords: ['seafood', 'prawn', 'shrimp', 'crab', 'tilapia', 'dried fish', 'stockfish'] },
  { key: 'eggs', emoji: '🥚', label: 'Eggs', group: 'Food & grocery', keywords: ['crate', 'poultry', 'dozen'] },
  { key: 'dairy', emoji: '🥛', label: 'Dairy & milk', group: 'Food & grocery', keywords: ['milk', 'yoghurt', 'yogurt', 'cream', 'butter', 'powdered milk'] },
  { key: 'cheese', emoji: '🧀', label: 'Cheese', group: 'Food & grocery', keywords: ['dairy', 'deli', 'wara'] },
  { key: 'oil', emoji: '🫒', label: 'Cooking oil', group: 'Food & grocery', keywords: ['vegetable oil', 'palm oil', 'olive', 'groundnut oil', 'frying', 'fat'] },
  { key: 'spices', emoji: '🧂', label: 'Spices & seasoning', group: 'Food & grocery', keywords: ['salt', 'seasoning', 'curry', 'thyme', 'cube', 'maggi', 'herbs', 'pepper'] },
  { key: 'condiments', emoji: '🥫', label: 'Sauces & condiments', group: 'Food & grocery', keywords: ['ketchup', 'mayonnaise', 'soy sauce', 'vinegar', 'mustard', 'dressing'] },
  { key: 'canned', emoji: '🥫', label: 'Canned & tinned', group: 'Food & grocery', keywords: ['tin', 'preserved', 'sardines', 'corned beef', 'baked beans'] },
  { key: 'sugar', emoji: '🍯', label: 'Sugar & sweeteners', group: 'Food & grocery', keywords: ['honey', 'syrup', 'sweetener', 'glucose', 'cubes'] },
  { key: 'cereal', emoji: '🥣', label: 'Breakfast cereal', group: 'Food & grocery', keywords: ['cornflakes', 'oats', 'granola', 'pap', 'custard', 'porridge'] },
  { key: 'snacks', emoji: '🍿', label: 'Snacks', group: 'Food & grocery', keywords: ['crisps', 'chips', 'popcorn', 'plantain chips', 'nuts', 'groundnut'] },
  { key: 'biscuits', emoji: '🍪', label: 'Biscuits & cookies', group: 'Food & grocery', keywords: ['cookies', 'crackers', 'wafer', 'digestive'] },
  { key: 'chocolate', emoji: '🍫', label: 'Chocolate', group: 'Food & grocery', keywords: ['cocoa', 'bar', 'candy', 'confectionery'] },
  { key: 'sweets', emoji: '🍬', label: 'Sweets & candy', group: 'Food & grocery', keywords: ['candy', 'lollipop', 'gum', 'mints', 'toffee', 'confectionery'] },
  { key: 'frozen', emoji: '🧊', label: 'Frozen foods', group: 'Food & grocery', keywords: ['freezer', 'ice', 'cold room', 'chilled'] },
  { key: 'babyfood', emoji: '🍼', label: 'Baby food', group: 'Food & grocery', keywords: ['formula', 'infant', 'cerelac', 'weaning'] },
  { key: 'organic', emoji: '🌱', label: 'Organic & health food', group: 'Food & grocery', keywords: ['natural', 'vegan', 'gluten free', 'wholefood', 'diet'] },

  // ---- Drinks ---------------------------------------------------------------
  { key: 'water', emoji: '💧', label: 'Water', group: 'Drinks', keywords: ['bottled', 'sachet', 'pure water', 'mineral', 'table water'] },
  { key: 'softdrinks', emoji: '🥤', label: 'Soft drinks', group: 'Drinks', keywords: ['soda', 'pop', 'minerals', 'cola', 'fizzy', 'carbonated'] },
  { key: 'juice', emoji: '🧃', label: 'Juice', group: 'Drinks', keywords: ['fruit juice', 'nectar', 'smoothie', 'carton'] },
  { key: 'coffee', emoji: '☕', label: 'Coffee', group: 'Drinks', keywords: ['espresso', 'latte', 'beans', 'instant', 'cappuccino'] },
  { key: 'tea', emoji: '🍵', label: 'Tea', group: 'Drinks', keywords: ['teabags', 'green tea', 'herbal', 'lipton', 'chai'] },
  { key: 'energydrinks', emoji: '⚡', label: 'Energy drinks', group: 'Drinks', keywords: ['isotonic', 'sports drink', 'boost', 'caffeine'] },
  { key: 'beer', emoji: '🍺', label: 'Beer', group: 'Drinks', keywords: ['lager', 'stout', 'ale', 'brewery', 'alcohol'] },
  { key: 'wine', emoji: '🍷', label: 'Wine', group: 'Drinks', keywords: ['red', 'white', 'rose', 'alcohol', 'cellar'] },
  { key: 'spirits', emoji: '🥃', label: 'Spirits & liquor', group: 'Drinks', keywords: ['whisky', 'vodka', 'gin', 'rum', 'brandy', 'alcohol', 'liquor'] },
  { key: 'cocktail', emoji: '🍹', label: 'Cocktails & mixers', group: 'Drinks', keywords: ['mixer', 'bar', 'tonic', 'syrup'] },

  // ---- Bakery & sweets ------------------------------------------------------
  { key: 'cake', emoji: '🍰', label: 'Cakes', group: 'Bakery & sweets', keywords: ['birthday', 'sponge', 'patisserie', 'slice'] },
  { key: 'pastry', emoji: '🥐', label: 'Pastries', group: 'Bakery & sweets', keywords: ['croissant', 'meat pie', 'sausage roll', 'puff', 'danish'] },
  { key: 'donut', emoji: '🍩', label: 'Doughnuts', group: 'Bakery & sweets', keywords: ['donut', 'ring', 'glazed'] },
  { key: 'cupcake', emoji: '🧁', label: 'Cupcakes & muffins', group: 'Bakery & sweets', keywords: ['muffin', 'small cake', 'frosting'] },
  { key: 'pie', emoji: '🥧', label: 'Pies & tarts', group: 'Bakery & sweets', keywords: ['tart', 'meat pie', 'quiche'] },
  { key: 'icecream', emoji: '🍦', label: 'Ice cream', group: 'Bakery & sweets', keywords: ['frozen dessert', 'gelato', 'cone', 'sorbet', 'yoghurt'] },
  { key: 'dessert', emoji: '🍮', label: 'Desserts', group: 'Bakery & sweets', keywords: ['pudding', 'custard', 'sweet course'] },

  // ---- Prepared food --------------------------------------------------------
  { key: 'mainmeal', emoji: '🍛', label: 'Main dishes', group: 'Prepared food', keywords: ['plate', 'entree', 'main course', 'jollof', 'curry', 'stew', 'special'] },
  { key: 'soup', emoji: '🍲', label: 'Soups & stews', group: 'Prepared food', keywords: ['broth', 'pot', 'egusi', 'pepper soup', 'pottage'] },
  { key: 'swallow', emoji: '🥘', label: 'Swallow & sides', group: 'Prepared food', keywords: ['fufu', 'eba', 'pounded yam', 'ugali', 'sadza', 'side dish', 'accompaniment'] },
  { key: 'burger', emoji: '🍔', label: 'Burgers', group: 'Prepared food', keywords: ['fast food', 'cheeseburger', 'patty', 'grill'] },
  { key: 'pizza', emoji: '🍕', label: 'Pizza', group: 'Prepared food', keywords: ['slice', 'italian', 'pepperoni', 'margherita'] },
  { key: 'sandwich', emoji: '🥪', label: 'Sandwiches & wraps', group: 'Prepared food', keywords: ['sub', 'panini', 'wrap', 'shawarma', 'toastie'] },
  { key: 'friedchicken', emoji: '🍗', label: 'Fried chicken', group: 'Prepared food', keywords: ['broasted', 'wings', 'bucket', 'fast food'] },
  { key: 'grill', emoji: '🍖', label: 'Grills & barbecue', group: 'Prepared food', keywords: ['bbq', 'suya', 'kebab', 'skewer', 'braai', 'roast'] },
  { key: 'fries', emoji: '🍟', label: 'Fries & sides', group: 'Prepared food', keywords: ['chips', 'wedges', 'yam chips', 'side'] },
  { key: 'salad', emoji: '🥗', label: 'Salads', group: 'Prepared food', keywords: ['bowl', 'greens', 'coleslaw', 'healthy'] },
  { key: 'sushi', emoji: '🍣', label: 'Sushi', group: 'Prepared food', keywords: ['japanese', 'sashimi', 'maki', 'roll'] },
  { key: 'taco', emoji: '🌮', label: 'Tacos & burritos', group: 'Prepared food', keywords: ['mexican', 'wrap', 'quesadilla'] },
  { key: 'breakfast', emoji: '🍳', label: 'Breakfast', group: 'Prepared food', keywords: ['eggs', 'morning', 'omelette', 'brunch', 'toast'] },
  { key: 'combo', emoji: '🍱', label: 'Combos & platters', group: 'Prepared food', keywords: ['meal deal', 'bento', 'set menu', 'platter', 'bundle'] },
  { key: 'takeaway', emoji: '🥡', label: 'Takeaway', group: 'Prepared food', keywords: ['takeout', 'delivery', 'to go', 'pack'] },

  // ---- Household ------------------------------------------------------------
  { key: 'cleaning', emoji: '🧽', label: 'Cleaning supplies', group: 'Household', keywords: ['sponge', 'scourer', 'disinfectant', 'bleach', 'mop', 'brush'] },
  { key: 'detergent', emoji: '🧴', label: 'Detergents', group: 'Household', keywords: ['washing', 'soap powder', 'liquid', 'omo', 'fabric softener'] },
  { key: 'laundry', emoji: '🧺', label: 'Laundry', group: 'Household', keywords: ['washing', 'basket', 'pegs', 'hangers', 'starch'] },
  { key: 'soapbar', emoji: '🧼', label: 'Soap', group: 'Household', keywords: ['bar soap', 'bath', 'antiseptic', 'washing'] },
  { key: 'paperproducts', emoji: '🧻', label: 'Paper products', group: 'Household', keywords: ['tissue', 'toilet roll', 'serviette', 'napkin', 'kitchen towel'] },
  { key: 'bin', emoji: '🗑️', label: 'Bins & waste', group: 'Household', keywords: ['refuse', 'trash bags', 'nylon', 'rubbish', 'disposal'] },
  { key: 'airfreshener', emoji: '🌸', label: 'Air fresheners', group: 'Household', keywords: ['deodoriser', 'scent', 'spray', 'fragrance'] },
  { key: 'insecticide', emoji: '🦟', label: 'Pest control', group: 'Household', keywords: ['insecticide', 'mosquito', 'raid', 'repellent', 'rat', 'net'] },
  { key: 'kitchenware', emoji: '🍳', label: 'Kitchenware', group: 'Household', keywords: ['pots', 'pans', 'cookware', 'utensils', 'cooking'] },
  { key: 'cutlery', emoji: '🍴', label: 'Cutlery & tableware', group: 'Household', keywords: ['spoons', 'forks', 'plates', 'crockery', 'glasses', 'dishes'] },
  { key: 'storage', emoji: '📦', label: 'Storage & containers', group: 'Household', keywords: ['tupperware', 'boxes', 'flask', 'cooler', 'jars', 'buckets'] },
  { key: 'candles', emoji: '🕯️', label: 'Candles & matches', group: 'Household', keywords: ['matches', 'lighter', 'wax', 'lantern'] },
  { key: 'batteries', emoji: '🔋', label: 'Batteries', group: 'Household', keywords: ['cells', 'aa', 'aaa', 'power', 'torch'] },
  { key: 'bulbs', emoji: '💡', label: 'Bulbs & lighting', group: 'Household', keywords: ['lamp', 'led', 'fluorescent', 'torch', 'lighting'] },
  { key: 'gas', emoji: '🔥', label: 'Gas & fuel', group: 'Household', keywords: ['cooking gas', 'lpg', 'cylinder', 'kerosene', 'charcoal', 'firewood'] },

  // ---- Personal care --------------------------------------------------------
  { key: 'skincare', emoji: '🧴', label: 'Skincare', group: 'Personal care', keywords: ['lotion', 'cream', 'moisturiser', 'body butter', 'sunscreen', 'serum'] },
  { key: 'haircare', emoji: '💇', label: 'Hair care', group: 'Personal care', keywords: ['shampoo', 'relaxer', 'conditioner', 'hair food', 'weave', 'wig', 'braids'] },
  { key: 'cosmetics', emoji: '💄', label: 'Cosmetics & makeup', group: 'Personal care', keywords: ['makeup', 'lipstick', 'foundation', 'powder', 'beauty'] },
  { key: 'perfume', emoji: '🧴', label: 'Perfume & fragrance', group: 'Personal care', keywords: ['cologne', 'scent', 'body spray', 'deodorant', 'eau de'] },
  { key: 'oralcare', emoji: '🪥', label: 'Oral care', group: 'Personal care', keywords: ['toothpaste', 'toothbrush', 'mouthwash', 'dental', 'floss'] },
  { key: 'shaving', emoji: '🪒', label: 'Shaving & grooming', group: 'Personal care', keywords: ['razor', 'clipper', 'beard', 'trimmer', 'aftershave'] },
  { key: 'nails', emoji: '💅', label: 'Nail care', group: 'Personal care', keywords: ['polish', 'manicure', 'pedicure', 'acrylic'] },
  { key: 'feminine', emoji: '🌷', label: 'Feminine care', group: 'Personal care', keywords: ['sanitary', 'pads', 'tampons', 'menstrual', 'hygiene'] },
  { key: 'diapers', emoji: '🍼', label: 'Diapers & baby care', group: 'Personal care', keywords: ['nappies', 'pampers', 'wipes', 'baby lotion', 'infant'] },
  { key: 'bath', emoji: '🛁', label: 'Bath & body', group: 'Personal care', keywords: ['shower gel', 'sponge', 'towel', 'bathing'] },

  // ---- Health & pharmacy ----------------------------------------------------
  { key: 'medicine', emoji: '💊', label: 'Medicine', group: 'Health & pharmacy', keywords: ['drugs', 'tablets', 'pharmacy', 'chemist', 'drugstore', 'prescription', 'capsules'] },
  { key: 'vitamins', emoji: '🍊', label: 'Vitamins & supplements', group: 'Health & pharmacy', keywords: ['multivitamin', 'supplement', 'protein', 'immune', 'omega'] },
  { key: 'firstaid', emoji: '🩹', label: 'First aid', group: 'Health & pharmacy', keywords: ['plaster', 'bandage', 'antiseptic', 'gauze', 'wound', 'kit'] },
  { key: 'medicaldevice', emoji: '🩺', label: 'Medical devices', group: 'Health & pharmacy', keywords: ['thermometer', 'bp monitor', 'glucometer', 'stethoscope', 'nebuliser'] },
  { key: 'ppe', emoji: '😷', label: 'Masks & protection', group: 'Health & pharmacy', keywords: ['face mask', 'gloves', 'sanitizer', 'ppe', 'hygiene'] },
  { key: 'eyecare', emoji: '👓', label: 'Eyewear & eye care', group: 'Health & pharmacy', keywords: ['glasses', 'spectacles', 'lenses', 'optician', 'reading'] },
  { key: 'mobility', emoji: '🦽', label: 'Mobility & care aids', group: 'Health & pharmacy', keywords: ['wheelchair', 'crutches', 'walker', 'support', 'elderly'] },
  { key: 'herbal', emoji: '🌿', label: 'Herbal & traditional', group: 'Health & pharmacy', keywords: ['natural remedy', 'roots', 'agbo', 'ayurvedic', 'tonic'] },

  // ---- Fashion --------------------------------------------------------------
  { key: 'clothing', emoji: '👕', label: 'Clothing', group: 'Fashion', keywords: ['shirts', 'tops', 'tees', 'apparel', 'garments', 'wear'] },
  { key: 'dresses', emoji: '👗', label: 'Dresses', group: 'Fashion', keywords: ['gown', 'frock', 'womenswear', 'skirt'] },
  { key: 'trousers', emoji: '👖', label: 'Trousers & jeans', group: 'Fashion', keywords: ['pants', 'denim', 'chinos', 'shorts', 'bottoms'] },
  { key: 'outerwear', emoji: '🧥', label: 'Jackets & outerwear', group: 'Fashion', keywords: ['coat', 'blazer', 'hoodie', 'sweater', 'cardigan'] },
  { key: 'traditionalwear', emoji: '🥻', label: 'Traditional wear', group: 'Fashion', keywords: ['native', 'ankara', 'kaftan', 'saree', 'agbada', 'cultural', 'kente'] },
  { key: 'shoes', emoji: '👟', label: 'Shoes', group: 'Fashion', keywords: ['sneakers', 'trainers', 'footwear', 'canvas'] },
  { key: 'formalshoes', emoji: '👞', label: 'Formal shoes', group: 'Fashion', keywords: ['leather', 'oxford', 'loafers', 'office', 'dress shoes'] },
  { key: 'heels', emoji: '👠', label: 'Heels & sandals', group: 'Fashion', keywords: ['slippers', 'flats', 'pumps', 'palm slippers', 'flip flops'] },
  { key: 'bags', emoji: '👜', label: 'Bags & purses', group: 'Fashion', keywords: ['handbag', 'purse', 'clutch', 'tote', 'backpack'] },
  { key: 'luggage', emoji: '🧳', label: 'Luggage & travel', group: 'Fashion', keywords: ['suitcase', 'trolley', 'travel bag', 'duffel'] },
  { key: 'jewellery', emoji: '💍', label: 'Jewellery', group: 'Fashion', keywords: ['jewelry', 'rings', 'necklace', 'earrings', 'bracelet', 'gold', 'beads'] },
  { key: 'watches', emoji: '⌚', label: 'Watches', group: 'Fashion', keywords: ['timepiece', 'wristwatch', 'clock'] },
  { key: 'sunglasses', emoji: '🕶️', label: 'Sunglasses', group: 'Fashion', keywords: ['shades', 'eyewear', 'goggles'] },
  { key: 'hats', emoji: '🧢', label: 'Hats & caps', group: 'Fashion', keywords: ['cap', 'beanie', 'headwear', 'fila', 'scarf', 'hijab'] },
  { key: 'underwear', emoji: '🩲', label: 'Underwear & lingerie', group: 'Fashion', keywords: ['bra', 'boxers', 'pants', 'innerwear', 'nightwear'] },
  { key: 'socks', emoji: '🧦', label: 'Socks & hosiery', group: 'Fashion', keywords: ['stockings', 'tights', 'leggings'] },
  { key: 'kidswear', emoji: '🧒', label: "Children's wear", group: 'Fashion', keywords: ['kids', 'baby clothes', 'boys', 'girls', 'infant'] },
  { key: 'sportswear', emoji: '🏃', label: 'Sportswear', group: 'Fashion', keywords: ['activewear', 'jersey', 'gym wear', 'tracksuit'] },
  { key: 'uniforms', emoji: '🥼', label: 'Uniforms & workwear', group: 'Fashion', keywords: ['school uniform', 'overall', 'scrubs', 'corporate', 'coverall'] },
  { key: 'fabric', emoji: '🧵', label: 'Fabric & textiles', group: 'Fashion', keywords: ['cloth', 'material', 'lace', 'ankara', 'thread', 'sewing', 'yards'] },

  // ---- Electronics ----------------------------------------------------------
  { key: 'phones', emoji: '📱', label: 'Phones', group: 'Electronics', keywords: ['mobile', 'smartphone', 'handset', 'android', 'iphone'] },
  { key: 'laptops', emoji: '💻', label: 'Laptops & computers', group: 'Electronics', keywords: ['pc', 'notebook', 'macbook', 'desktop', 'computer'] },
  { key: 'tablets', emoji: '📲', label: 'Tablets', group: 'Electronics', keywords: ['ipad', 'tab', 'e-reader'] },
  { key: 'tv', emoji: '📺', label: 'TVs & displays', group: 'Electronics', keywords: ['television', 'monitor', 'screen', 'smart tv', 'decoder'] },
  { key: 'audio', emoji: '🎧', label: 'Audio & headphones', group: 'Electronics', keywords: ['earphones', 'earbuds', 'headset', 'airpods'] },
  { key: 'speakers', emoji: '🔊', label: 'Speakers & sound', group: 'Electronics', keywords: ['bluetooth speaker', 'sound system', 'amplifier', 'woofer', 'pa'] },
  { key: 'camera', emoji: '📷', label: 'Cameras', group: 'Electronics', keywords: ['photography', 'dslr', 'lens', 'camcorder', 'cctv'] },
  { key: 'gaming', emoji: '🎮', label: 'Gaming', group: 'Electronics', keywords: ['console', 'playstation', 'xbox', 'controller', 'games'] },
  { key: 'chargers', emoji: '🔌', label: 'Chargers & cables', group: 'Electronics', keywords: ['adapter', 'usb', 'power bank', 'cord', 'plug', 'extension'] },
  { key: 'accessories', emoji: '🎒', label: 'Device accessories', group: 'Electronics', keywords: ['case', 'screen protector', 'pouch', 'holder', 'stand'] },
  { key: 'storage_media', emoji: '💾', label: 'Storage & memory', group: 'Electronics', keywords: ['flash drive', 'memory card', 'sd', 'hard drive', 'ssd', 'usb'] },
  { key: 'printers', emoji: '🖨️', label: 'Printers & scanners', group: 'Electronics', keywords: ['toner', 'cartridge', 'copier', 'scanner', 'ink'] },
  { key: 'networking', emoji: '📡', label: 'Networking', group: 'Electronics', keywords: ['router', 'modem', 'wifi', 'antenna', 'dish', 'cable'] },
  { key: 'smartwatch', emoji: '⌚', label: 'Smart wearables', group: 'Electronics', keywords: ['fitness band', 'smartwatch', 'tracker'] },
  { key: 'solar', emoji: '☀️', label: 'Solar & power', group: 'Electronics', keywords: ['inverter', 'panel', 'generator', 'ups', 'stabiliser', 'backup'] },

  // ---- Appliances -----------------------------------------------------------
  { key: 'fridge', emoji: '🧊', label: 'Fridges & freezers', group: 'Appliances', keywords: ['refrigerator', 'freezer', 'cooler', 'chest'] },
  { key: 'washingmachine', emoji: '🌀', label: 'Washing machines', group: 'Appliances', keywords: ['washer', 'dryer', 'laundry machine'] },
  { key: 'microwave', emoji: '🍲', label: 'Microwaves & ovens', group: 'Appliances', keywords: ['oven', 'cooker', 'stove', 'air fryer', 'toaster'] },
  { key: 'fan', emoji: '🌬️', label: 'Fans & cooling', group: 'Appliances', keywords: ['standing fan', 'ceiling fan', 'air conditioner', 'ac', 'cooler'] },
  { key: 'heater', emoji: '♨️', label: 'Heaters & water heaters', group: 'Appliances', keywords: ['geyser', 'boiler', 'warmer', 'radiator'] },
  { key: 'blender', emoji: '🥤', label: 'Small kitchen appliances', group: 'Appliances', keywords: ['blender', 'mixer', 'kettle', 'grinder', 'juicer', 'rice cooker'] },
  { key: 'iron', emoji: '🧺', label: 'Irons & garment care', group: 'Appliances', keywords: ['pressing iron', 'steamer', 'ironing board'] },
  { key: 'vacuum', emoji: '🧹', label: 'Vacuums & floor care', group: 'Appliances', keywords: ['hoover', 'sweeper', 'mop', 'cleaner'] },

  // ---- Home & furniture -----------------------------------------------------
  { key: 'furniture', emoji: '🛋️', label: 'Furniture', group: 'Home & furniture', keywords: ['sofa', 'settee', 'couch', 'chairs', 'tables', 'cabinet'] },
  { key: 'beds', emoji: '🛏️', label: 'Beds & mattresses', group: 'Home & furniture', keywords: ['mattress', 'bedframe', 'bunk', 'pillow'] },
  { key: 'bedding', emoji: '🧸', label: 'Bedding & linen', group: 'Home & furniture', keywords: ['sheets', 'duvet', 'blanket', 'pillowcase', 'towels'] },
  { key: 'curtains', emoji: '🪟', label: 'Curtains & blinds', group: 'Home & furniture', keywords: ['drapes', 'net', 'window', 'shades'] },
  { key: 'rugs', emoji: '🧶', label: 'Rugs & carpets', group: 'Home & furniture', keywords: ['carpet', 'mat', 'flooring', 'doormat'] },
  { key: 'decor', emoji: '🖼️', label: 'Home decor', group: 'Home & furniture', keywords: ['art', 'frames', 'vases', 'ornaments', 'wall'] },
  { key: 'mirrors', emoji: '🪞', label: 'Mirrors', group: 'Home & furniture', keywords: ['dressing', 'wall mirror', 'glass'] },
  { key: 'clocks', emoji: '🕰️', label: 'Clocks', group: 'Home & furniture', keywords: ['wall clock', 'alarm', 'time'] },
  { key: 'plants', emoji: '🪴', label: 'Plants & planters', group: 'Home & furniture', keywords: ['flowers', 'pots', 'garden', 'greenery', 'indoor'] },

  // ---- Hardware & building --------------------------------------------------
  { key: 'tools', emoji: '🔧', label: 'Hand tools', group: 'Hardware & building', keywords: ['spanner', 'wrench', 'pliers', 'screwdriver', 'toolbox'] },
  { key: 'powertools', emoji: '🪚', label: 'Power tools', group: 'Hardware & building', keywords: ['drill', 'grinder', 'saw', 'sander', 'machine'] },
  { key: 'fasteners', emoji: '🔩', label: 'Nails & fasteners', group: 'Hardware & building', keywords: ['screws', 'bolts', 'nuts', 'washers', 'anchors'] },
  { key: 'paint', emoji: '🎨', label: 'Paint & finishes', group: 'Hardware & building', keywords: ['emulsion', 'primer', 'varnish', 'brush', 'roller', 'thinner'] },
  { key: 'plumbing', emoji: '🚿', label: 'Plumbing', group: 'Hardware & building', keywords: ['pipes', 'taps', 'fittings', 'sink', 'toilet', 'ppr'] },
  { key: 'electrical', emoji: '⚡', label: 'Electrical', group: 'Hardware & building', keywords: ['wire', 'cable', 'switch', 'socket', 'breaker', 'conduit'] },
  { key: 'cement', emoji: '🧱', label: 'Cement & blocks', group: 'Hardware & building', keywords: ['bricks', 'concrete', 'mortar', 'sand', 'gravel', 'building materials'] },
  { key: 'timber', emoji: '🪵', label: 'Timber & wood', group: 'Hardware & building', keywords: ['lumber', 'plywood', 'planks', 'board', 'carpentry'] },
  { key: 'tiles', emoji: '◻️', label: 'Tiles & flooring', group: 'Hardware & building', keywords: ['ceramic', 'marble', 'granite', 'vinyl', 'floor'] },
  { key: 'roofing', emoji: '🏠', label: 'Roofing & sheets', group: 'Hardware & building', keywords: ['zinc', 'aluminium', 'shingles', 'gutter', 'ceiling'] },
  { key: 'doors', emoji: '🚪', label: 'Doors & windows', group: 'Hardware & building', keywords: ['frames', 'glass', 'shutters', 'gates'] },
  { key: 'locks', emoji: '🔐', label: 'Locks & security', group: 'Hardware & building', keywords: ['padlock', 'keys', 'alarm', 'safe', 'burglary'] },
  { key: 'safety', emoji: '🦺', label: 'Safety equipment', group: 'Hardware & building', keywords: ['helmet', 'gloves', 'boots', 'goggles', 'vest', 'ppe', 'extinguisher'] },
  { key: 'ladders', emoji: '🪜', label: 'Ladders & access', group: 'Hardware & building', keywords: ['step', 'scaffold', 'platform'] },

  // ---- Automotive -----------------------------------------------------------
  { key: 'carparts', emoji: '🚗', label: 'Car parts', group: 'Automotive', keywords: ['spares', 'auto', 'vehicle', 'engine', 'brake', 'filter', 'clutch'] },
  { key: 'tyres', emoji: '🛞', label: 'Tyres & wheels', group: 'Automotive', keywords: ['tires', 'rims', 'alloy', 'tube', 'wheel'] },
  { key: 'engineoil', emoji: '🛢️', label: 'Lubricants & fluids', group: 'Automotive', keywords: ['engine oil', 'grease', 'coolant', 'brake fluid', 'atf'] },
  { key: 'carbattery', emoji: '🔋', label: 'Car batteries', group: 'Automotive', keywords: ['accumulator', 'starter', 'battery'] },
  { key: 'caraccessories', emoji: '🧼', label: 'Car care & accessories', group: 'Automotive', keywords: ['car wash', 'polish', 'seat cover', 'floor mat', 'air freshener'] },
  { key: 'motorcycle', emoji: '🏍️', label: 'Motorcycles & parts', group: 'Automotive', keywords: ['bike', 'okada', 'boda', 'scooter', 'helmet'] },
  { key: 'bicycle', emoji: '🚲', label: 'Bicycles', group: 'Automotive', keywords: ['cycle', 'bike', 'pedal', 'chain'] },
  { key: 'fuelstation', emoji: '⛽', label: 'Fuel', group: 'Automotive', keywords: ['petrol', 'diesel', 'gasoline', 'station', 'pump'] },

  // ---- Agriculture ----------------------------------------------------------
  { key: 'seeds', emoji: '🌱', label: 'Seeds & seedlings', group: 'Agriculture', keywords: ['planting', 'nursery', 'sowing', 'germination'] },
  { key: 'fertiliser', emoji: '🧪', label: 'Fertiliser & chemicals', group: 'Agriculture', keywords: ['fertilizer', 'npk', 'urea', 'manure', 'nutrient'] },
  { key: 'pesticide', emoji: '🐛', label: 'Pesticides & herbicides', group: 'Agriculture', keywords: ['insecticide', 'weedkiller', 'fungicide', 'spray', 'agrochemical'] },
  { key: 'farmtools', emoji: '🪓', label: 'Farm tools', group: 'Agriculture', keywords: ['hoe', 'cutlass', 'machete', 'rake', 'shovel', 'implements'] },
  { key: 'livestock', emoji: '🐄', label: 'Livestock', group: 'Agriculture', keywords: ['cattle', 'goat', 'sheep', 'pig', 'cow', 'animals'] },
  { key: 'poultryfarm', emoji: '🐓', label: 'Poultry & birds', group: 'Agriculture', keywords: ['chicken', 'layers', 'broilers', 'day old chicks', 'hatchery'] },
  { key: 'animalfeed', emoji: '🌽', label: 'Animal feed', group: 'Agriculture', keywords: ['fodder', 'mash', 'pellets', 'bran', 'concentrate'] },
  { key: 'irrigation', emoji: '💦', label: 'Irrigation & water', group: 'Agriculture', keywords: ['sprinkler', 'hose', 'pump', 'drip', 'borehole', 'tank'] },
  { key: 'vetsupplies', emoji: '🐾', label: 'Veterinary supplies', group: 'Agriculture', keywords: ['vaccine', 'animal medicine', 'dewormer', 'vet'] },

  // ---- Office & school ------------------------------------------------------
  { key: 'stationery', emoji: '✏️', label: 'Stationery', group: 'Office & school', keywords: ['pens', 'pencils', 'markers', 'eraser', 'ruler', 'biro'] },
  { key: 'paper', emoji: '📄', label: 'Paper & printing', group: 'Office & school', keywords: ['a4', 'reams', 'photocopy', 'card', 'printing'] },
  { key: 'notebooks', emoji: '📓', label: 'Notebooks & exercise books', group: 'Office & school', keywords: ['jotter', 'exercise book', 'diary', 'pad', 'journal'] },
  { key: 'files', emoji: '🗂️', label: 'Files & filing', group: 'Office & school', keywords: ['folder', 'binder', 'envelope', 'archive', 'clipboard'] },
  { key: 'books', emoji: '📚', label: 'Books', group: 'Office & school', keywords: ['textbooks', 'novels', 'literature', 'reading', 'bookshop'] },
  { key: 'artsupplies', emoji: '🖌️', label: 'Art supplies', group: 'Office & school', keywords: ['crayons', 'paint', 'brushes', 'sketch', 'colouring', 'canvas'] },
  { key: 'schoolbag', emoji: '🎒', label: 'School supplies', group: 'Office & school', keywords: ['backpack', 'lunch box', 'geometry set', 'uniform', 'pupils'] },
  { key: 'calculators', emoji: '🧮', label: 'Calculators', group: 'Office & school', keywords: ['scientific', 'abacus', 'counting'] },
  { key: 'officeequipment', emoji: '🖇️', label: 'Office equipment', group: 'Office & school', keywords: ['stapler', 'punch', 'clips', 'tape', 'whiteboard', 'shredder'] },

  // ---- Toys & baby ----------------------------------------------------------
  { key: 'toys', emoji: '🧸', label: 'Toys', group: 'Toys & baby', keywords: ['playthings', 'teddy', 'dolls', 'figures', 'children'] },
  { key: 'games', emoji: '🎲', label: 'Games & puzzles', group: 'Toys & baby', keywords: ['board games', 'cards', 'ludo', 'chess', 'jigsaw'] },
  { key: 'outdoortoys', emoji: '🛴', label: 'Ride-ons & outdoor toys', group: 'Toys & baby', keywords: ['scooter', 'tricycle', 'swing', 'slide'] },
  { key: 'babygear', emoji: '🍼', label: 'Baby gear', group: 'Toys & baby', keywords: ['stroller', 'pram', 'cot', 'car seat', 'walker', 'carrier'] },
  { key: 'partygames', emoji: '🎯', label: 'Party & activity', group: 'Toys & baby', keywords: ['darts', 'activity', 'kids party'] },

  // ---- Sports & outdoors ----------------------------------------------------
  { key: 'fitness', emoji: '🏋️', label: 'Fitness & gym', group: 'Sports & outdoors', keywords: ['weights', 'dumbbell', 'treadmill', 'yoga', 'workout', 'exercise'] },
  { key: 'ballsports', emoji: '⚽', label: 'Ball sports', group: 'Sports & outdoors', keywords: ['football', 'soccer', 'basketball', 'volleyball', 'tennis', 'jersey'] },
  { key: 'camping', emoji: '⛺', label: 'Camping & outdoors', group: 'Sports & outdoors', keywords: ['tent', 'sleeping bag', 'torch', 'hiking', 'survival'] },
  { key: 'fishing', emoji: '🎣', label: 'Fishing', group: 'Sports & outdoors', keywords: ['rod', 'net', 'bait', 'hooks', 'tackle'] },
  { key: 'swimming', emoji: '🏊', label: 'Swimming & water', group: 'Sports & outdoors', keywords: ['pool', 'goggles', 'swimsuit', 'float', 'beach'] },
  { key: 'cycling', emoji: '🚴', label: 'Cycling', group: 'Sports & outdoors', keywords: ['bike', 'helmet', 'gear', 'racing'] },

  // ---- Pets -----------------------------------------------------------------
  { key: 'petfood', emoji: '🦴', label: 'Pet food', group: 'Pets', keywords: ['dog food', 'cat food', 'kibble', 'treats'] },
  { key: 'petsupplies', emoji: '🐾', label: 'Pet supplies', group: 'Pets', keywords: ['leash', 'collar', 'cage', 'litter', 'grooming', 'toys'] },
  { key: 'dogs', emoji: '🐕', label: 'Dogs', group: 'Pets', keywords: ['puppy', 'canine', 'breed'] },
  { key: 'cats', emoji: '🐈', label: 'Cats', group: 'Pets', keywords: ['kitten', 'feline'] },
  { key: 'aquarium', emoji: '🐠', label: 'Aquarium & fish', group: 'Pets', keywords: ['tank', 'ornamental fish', 'filter', 'aquatic'] },
  { key: 'birds', emoji: '🦜', label: 'Birds', group: 'Pets', keywords: ['parrot', 'cage', 'aviary', 'pigeon'] },

  // ---- Services -------------------------------------------------------------
  { key: 'repair', emoji: '🛠️', label: 'Repairs & maintenance', group: 'Services', keywords: ['fixing', 'servicing', 'workshop', 'mechanic', 'technician'] },
  { key: 'installation', emoji: '🔧', label: 'Installation', group: 'Services', keywords: ['fitting', 'setup', 'mounting', 'wiring'] },
  { key: 'delivery', emoji: '🚚', label: 'Delivery & logistics', group: 'Services', keywords: ['shipping', 'dispatch', 'courier', 'haulage', 'transport'] },
  { key: 'laundryservice', emoji: '👔', label: 'Laundry & dry cleaning', group: 'Services', keywords: ['washing', 'ironing', 'dry clean', 'press'] },
  { key: 'salon', emoji: '💈', label: 'Salon & barbering', group: 'Services', keywords: ['barber', 'hairdressing', 'spa', 'beauty', 'styling', 'makeup'] },
  { key: 'tailoring', emoji: '🪡', label: 'Tailoring & alterations', group: 'Services', keywords: ['sewing', 'fashion design', 'fitting', 'mending', 'seamstress'] },
  { key: 'photography', emoji: '📸', label: 'Photography & video', group: 'Services', keywords: ['photoshoot', 'videography', 'studio', 'coverage'] },
  { key: 'printingservice', emoji: '🖨️', label: 'Printing & branding', group: 'Services', keywords: ['banner', 'flyers', 'signage', 'souvenirs', 'branding', 'photocopy'] },
  { key: 'cleaningservice', emoji: '🧹', label: 'Cleaning services', group: 'Services', keywords: ['fumigation', 'janitorial', 'housekeeping', 'deep clean'] },
  { key: 'consulting', emoji: '💼', label: 'Professional services', group: 'Services', keywords: ['consulting', 'accounting', 'legal', 'advisory', 'agency'] },
  { key: 'tutoring', emoji: '🎓', label: 'Training & tutoring', group: 'Services', keywords: ['lessons', 'coaching', 'classes', 'education', 'workshop'] },
  { key: 'events', emoji: '🎪', label: 'Events & catering', group: 'Services', keywords: ['party', 'catering', 'decor', 'rentals', 'planning', 'hall'] },
  { key: 'rental', emoji: '🔑', label: 'Rentals & hire', group: 'Services', keywords: ['leasing', 'hire', 'borrow', 'equipment rental'] },
  { key: 'ticketing', emoji: '🎫', label: 'Tickets & bookings', group: 'Services', keywords: ['travel', 'flight', 'reservation', 'booking', 'entry'] },
  { key: 'medicalservice', emoji: '🏥', label: 'Health services', group: 'Services', keywords: ['clinic', 'consultation', 'lab test', 'dental', 'nursing'] },

  // ---- Digital & telecom ----------------------------------------------------
  { key: 'airtime', emoji: '📶', label: 'Airtime & data', group: 'Digital & telecom', keywords: ['recharge', 'top up', 'credit', 'bundle', 'mtn', 'network'] },
  { key: 'sim', emoji: '📇', label: 'SIM cards', group: 'Digital & telecom', keywords: ['line', 'registration', 'mobile'] },
  { key: 'giftcards', emoji: '🎁', label: 'Gift cards & vouchers', group: 'Digital & telecom', keywords: ['voucher', 'coupon', 'prepaid', 'redeem'] },
  { key: 'subscriptions', emoji: '🔁', label: 'Subscriptions', group: 'Digital & telecom', keywords: ['renewal', 'monthly', 'plan', 'membership', 'cable tv'] },
  { key: 'software', emoji: '🧑‍💻', label: 'Software & licences', group: 'Digital & telecom', keywords: ['licence', 'license', 'app', 'antivirus', 'key'] },
  { key: 'bills', emoji: '🧾', label: 'Bill payments', group: 'Digital & telecom', keywords: ['utility', 'electricity', 'water bill', 'token', 'prepaid meter'] },
  { key: 'moneyservices', emoji: '💵', label: 'Money services', group: 'Digital & telecom', keywords: ['transfer', 'withdrawal', 'pos', 'agent banking', 'exchange'] },

  // ---- Gifts & occasions ----------------------------------------------------
  { key: 'gifts', emoji: '🎁', label: 'Gifts', group: 'Gifts & occasions', keywords: ['present', 'hamper', 'souvenir', 'wrapping'] },
  { key: 'party', emoji: '🎉', label: 'Party supplies', group: 'Gifts & occasions', keywords: ['balloons', 'confetti', 'decorations', 'celebration', 'disposables'] },
  { key: 'flowers', emoji: '💐', label: 'Flowers', group: 'Gifts & occasions', keywords: ['bouquet', 'florist', 'roses', 'arrangement'] },
  { key: 'cards', emoji: '💌', label: 'Cards & invitations', group: 'Gifts & occasions', keywords: ['greeting', 'invite', 'stationery', 'wedding'] },
  { key: 'seasonal', emoji: '🎄', label: 'Seasonal & festive', group: 'Gifts & occasions', keywords: ['christmas', 'eid', 'easter', 'holiday', 'new year', 'decorations'] },

  // ---- Hobbies & culture ----------------------------------------------------
  { key: 'music', emoji: '🎵', label: 'Music & instruments', group: 'Hobbies & culture', keywords: ['guitar', 'keyboard', 'drums', 'records', 'audio', 'band'] },
  { key: 'crafts', emoji: '🧶', label: 'Crafts & handmade', group: 'Hobbies & culture', keywords: ['yarn', 'knitting', 'beads', 'diy', 'handmade', 'crochet'] },
  { key: 'religious', emoji: '🕊️', label: 'Religious items', group: 'Hobbies & culture', keywords: ['prayer', 'scripture', 'rosary', 'prayer mat', 'incense', 'devotional'] },
  { key: 'art', emoji: '🖼️', label: 'Art & collectibles', group: 'Hobbies & culture', keywords: ['painting', 'sculpture', 'antiques', 'craft', 'gallery'] },
  { key: 'tobacco', emoji: '🚬', label: 'Tobacco & vape', group: 'Hobbies & culture', keywords: ['cigarettes', 'vape', 'shisha', 'lighter', 'smoking'] },
  { key: 'stationeryhobby', emoji: '🃏', label: 'Cards & collectibles', group: 'Hobbies & culture', keywords: ['trading cards', 'stamps', 'coins', 'collecting'] },

  // ---- Shop shelves (merchandising, not a product type) ---------------------
  { key: 'general', emoji: '🛒', label: 'General', group: 'Shop shelves', keywords: ['miscellaneous', 'other', 'sundry', 'assorted', 'everything'] },
  { key: 'bestsellers', emoji: '⭐', label: 'Bestsellers', group: 'Shop shelves', keywords: ['popular', 'top', 'favourites', 'trending', 'hot'] },
  { key: 'newarrivals', emoji: '✨', label: 'New arrivals', group: 'Shop shelves', keywords: ['latest', 'just in', 'fresh stock', 'new'] },
  { key: 'promo', emoji: '🏷️', label: 'Promotions', group: 'Shop shelves', keywords: ['sale', 'discount', 'offer', 'deal', 'markdown'] },
  { key: 'clearance', emoji: '📉', label: 'Clearance', group: 'Shop shelves', keywords: ['closeout', 'last chance', 'reduced', 'end of line'] },
  { key: 'bundles', emoji: '🧺', label: 'Bundles & packs', group: 'Shop shelves', keywords: ['combo', 'multipack', 'set', 'kit', 'wholesale'] },
  { key: 'wholesale', emoji: '🏭', label: 'Wholesale & bulk', group: 'Shop shelves', keywords: ['carton', 'bulk', 'trade', 'distributor', 'case'] },
  { key: 'preorder', emoji: '📝', label: 'Pre-order & custom', group: 'Shop shelves', keywords: ['made to order', 'bespoke', 'request', 'backorder'] },
  { key: 'returns', emoji: '↩️', label: 'Returns & exchanges', group: 'Shop shelves', keywords: ['refund', 'swap', 'damaged', 'faulty'] },
  { key: 'consignment', emoji: '🤝', label: 'Consignment', group: 'Shop shelves', keywords: ['third party', 'partner stock', 'agent'] },
]

const BY_KEY = new Map(CATEGORY_ICONS.map((icon) => [icon.key, icon]))

/**
 * Resolve a stored icon value to something renderable.
 *
 * A stored value that is not a known key is returned as-is when it looks like a
 * plain glyph: businesses that picked a custom emoji before a key existed, or
 * that pasted one, should keep seeing it rather than losing their icon to a
 * dictionary lookup they never knew about. Anything longer is discarded — a
 * paragraph in an icon slot is corruption, not a choice.
 */
export function resolveCategoryIcon(value: string | null | undefined): string | null {
  if (!value) return null
  const known = BY_KEY.get(value)
  if (known) return known.emoji
  return [...value].length <= 2 ? value : null
}

export function findCategoryIcon(key: string | null | undefined): CategoryIcon | undefined {
  return key ? BY_KEY.get(key) : undefined
}

/** True when the string is nothing but emoji — used to offer a typed glyph. */
export function isEmojiOnly(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || [...trimmed].length > 2) return false
  return /\p{Extended_Pictographic}/u.test(trimmed) && !/[\p{L}\p{N}]/u.test(trimmed)
}

/**
 * Rank matches so the obvious answer comes first.
 *
 * Typing "bread" must not bury 🍞 Bread under every entry that merely lists
 * "bakery" in its keywords, so an exact label match outranks a label prefix,
 * which outranks a keyword hit, which outranks a group hit.
 */
export function searchCategoryIcons(query: string): CategoryIcon[] {
  const q = query.trim().toLowerCase()
  if (!q) return CATEGORY_ICONS

  const scored: Array<{ icon: CategoryIcon; score: number }> = []
  for (const icon of CATEGORY_ICONS) {
    const label = icon.label.toLowerCase()
    let score = 0
    if (label === q) score = 100
    else if (label.startsWith(q)) score = 80
    else if (label.includes(q)) score = 60
    else if (icon.keywords.some((k) => k === q)) score = 50
    else if (icon.keywords.some((k) => k.startsWith(q))) score = 40
    else if (icon.keywords.some((k) => k.includes(q))) score = 25
    else if (icon.group.toLowerCase().includes(q)) score = 10
    if (score > 0) scored.push({ icon, score })
  }
  scored.sort((a, b) => b.score - a.score || a.icon.label.localeCompare(b.icon.label))
  return scored.map((s) => s.icon)
}

/**
 * A sensible default for a category the user just named, so the picker opens
 * on something plausible instead of empty. Only a confident match counts —
 * guessing wrong is worse than offering nothing.
 */
export function suggestIconForName(name: string): CategoryIcon | undefined {
  const matches = searchCategoryIcons(name)
  if (matches.length === 0 || matches === CATEGORY_ICONS) return undefined
  const q = name.trim().toLowerCase()
  const best = matches[0]
  const label = best.label.toLowerCase()
  const confident =
    label === q || label.startsWith(q) || best.keywords.some((k) => k === q) || q.includes(label)
  return confident ? best : undefined
}
