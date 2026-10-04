/**
 * pet-data.js — shared static configuration for the care form.
 *
 * Holds the per-species life stages, the autocomplete lists, the
 * Breed/Species noun rule and a deliberately conservative baseline of
 * well-documented hazards. No logic here touches the network.
 */
(function (global) {
  'use strict';

  // Life stages differ meaningfully between species, so each gets its own list.
  var STAGES = {
    Dog: ['Puppy (under 1 year)', 'Young adult (1-3 years)', 'Adult (3-7 years)', 'Senior (7 years and up)'],
    Cat: ['Kitten (under 1 year)', 'Young adult (1-3 years)', 'Adult (3-10 years)', 'Senior (10 years and up)'],
    Rabbit: ['Young (under 1 year)', 'Adult (1-5 years)', 'Senior (5 years and up)'],
    Hamster: ['Young (under 1 year)', 'Adult (1-2 years)', 'Senior (2 years and up)'],
    'Guinea Pig': ['Young (under 1 year)', 'Adult (1-4 years)', 'Senior (4 years and up)'],
    Bird: ['Young (under 1 year)', 'Adult (1-5 years)', 'Senior (5 years and up)'],
    Fish: ['Fry or juvenile (under 1 year)', 'Adult (1-5 years)', 'Senior (5 years and up)'],
    Reptile: ['Young (under 1 year)', 'Adult (1-5 years)', 'Senior (5 years and up)'],
    Horse: ['Foal (under 2 years)', 'Young adult (2-4 years)', 'Mature adult (4-15 years)', 'Senior (15 years and up)']
  };

  // Species is the correct noun for animals not usually described by breed.
  var SPECIES_NOUN = ['Fish', 'Reptile', 'Bird'];

  var BREEDS = {
    Dog: ['Labrador Retriever', 'Golden Retriever', 'German Shepherd', 'French Bulldog', 'Poodle',
      'Beagle', 'Bulldog', 'Australian Shepherd', 'Border Collie', 'Corgi', 'Husky', 'Chihuahua'],
    Cat: ['Domestic Shorthair', 'Maine Coon', 'Siamese', 'Persian', 'Ragdoll', 'Bengal',
      'British Shorthair', 'Sphynx', 'Russian Blue', 'Abyssinian'],
    Rabbit: ['Holland Lop', 'Mini Rex', 'Mini Lop', 'Netherland Dwarf', 'Lionhead', 'Flemish Giant',
      'English Spot', 'Rex'],
    Hamster: ['Syrian Hamster', 'Winter White Dwarf', 'Roborovski', 'Chinese Hamster', 'European'],
    'Guinea Pig': ['American Guinea Pig', 'Abyssinian Guinea Pig', 'Peruvian', 'Wheaton',
      'English Smooth Coat'],
    Bird: ['Budgerigar', 'Cockatiel', 'African Grey Parrot', 'Budgie', 'Lovebird', 'Canary',
      'Macaw', 'Conure', 'Finch'],
    Fish: ['Betta', 'Goldfish', 'Guppy', 'Neon Tetra', 'Corydoras', 'Angelfish', 'Molly',
      'Platy', 'Koi'],
    Reptile: ['Bearded Dragon', 'Leopard Gecko', 'Crested Gecko', 'Corn Snake', 'Ball Python',
      'Bearded Dragon', 'Tortoise', 'Green Anole'],
    Horse: ['Quarter Horse', 'Thoroughbred', 'Morgan', 'Arabian', 'Appaloosa', 'Paint Horse',
      'Warmblood', 'Miniature Horse']
  };

  var MIXED = 'Mixed / Not sure';

  /**
   * Baseline hazards. These are long-established, widely published facts,
   * kept short and non-alarming. They are shown alongside anything the model
   * returns; the model is instructed not to invent hazards of its own.
   */
  var HAZARDS = {
    Dog: [
      { label: 'Chocolate', value: 'Toxic — keep baking chocolate, cake and cocoa out of reach.' },
      { label: 'Xylitol', value: 'Sugar-free gum, candy and peanut butter can cause a dangerous blood sugar drop.' },
      { label: 'Grapes & raisins', value: 'Can cause acute kidney injury. No safe snack-sized amount.' },
      { label: 'Onions & garlic', value: 'Toxic to dogs in powder, raw, cooked and concentrated forms.' },
      { label: 'Macadamias', value: 'Causes weakness, tremors and overheating.' }
    ],
    Cat: [
      { label: 'Lilies', value: 'Pollen and leaves from true lilies can cause sudden kidney failure.' },
      { label: 'Chocolate', value: 'Toxic, especially dark chocolate and baking chocolate.' },
      { label: 'Onions & garlic', value: 'Toxic to cats in powder, raw and cooked forms.' },
      { label: 'Alcohol & caffeine', value: 'Small amounts can be dangerous.' },
      { label: 'String & thread', value: 'Swallowed string can wind around the intestine and needs urgent care.' }
    ],
    Rabbit: [
      { label: 'Sudden diet change', value: 'The most common danger — introduce food changes over 2 weeks.' },
      { label: 'Sugary treats', value: 'Excess sugar and starch can cause fatal gut stasis.' },
      { label: 'Chocolate & onions', value: 'Toxic; keep sweets and kitchen scraps away.' },
      { label: 'Insufficient hay', value: 'Low fibre is the main preventable cause of dental and gut disease.' }
    ],
    Hamster: [
      { label: 'Sugary treats', value: 'Honey and sweet treats risk obesity and diabetes.' },
      { label: 'Chocolate & onions', value: 'Toxic — keep human snacks away.' },
      { label: 'Sudden diet change', value: 'Can cause fatal digestive upset; change food gradually.' },
      { label: 'Sharp bedding', value: 'Avoid cedar and pine shavings and anything with loose fibres.' }
    ],
    'Guinea Pig': [
      { label: 'Vitamin C need', value: 'Unlike other rodents they cannot make their own; deficiency causes scurvy.' },
      { label: 'Sudden diet change', value: 'Can be fatal — always transition over 7-10 days.' },
      { label: 'Sugary treats', value: 'Fruit and sugary treats should be small and occasional.' },
      { label: 'Onions & chocolate', value: 'Toxic; keep human food away.' }
    ],
    Bird: [
      { label: 'Avocado', value: 'Persin in the flesh and skin is toxic to birds.' },
      { label: 'Chocolate & caffeine', value: 'Toxic; coffee, tea and energy drinks are unsafe.' },
      { label: 'Onions & garlic', value: 'Toxic, including cooked forms.' },
      { label: 'Teflon fumes', value: 'Overheated non-stick cookware releases fumes that can kill a bird.' },
      { label: 'Aerosols & candles', value: 'Fumes and scented products are harmful to their airways.' }
    ],
    Fish: [
      { label: 'Chlorinated water', value: 'Treat tap water with a dechlorinator before adding it to a tank.' },
      { label: 'Overfeeding', value: 'Uneaten food fouls the water and raises ammonia fast.' },
      { label: 'Water temperature swings', value: 'Sudden changes stress fish and encourage disease.' },
      { label: 'Mismatched temperature', value: 'Keep coldwater and tropical species in separate tanks.' }
    ],
    Reptile: [
      { label: 'Heat lamp burns', value: 'Bulbs need a guard and a thermostat; check the hot spot daily.' },
      { label: 'Inadequate UVB', value: 'Without UVB most species develop metabolic bone disease.' },
      { label: 'Temperature swings', value: 'A proper day/night gradient is needed, not a constant heat.' },
      { label: 'Handling too soon', value: 'Reptiles often need to settle before regular handling.' }
    ],
    Horse: [
      { label: 'Toxic pasture plants', value: 'Poison hemlock, yew and acorns can be fatal. Inspect fields.' },
      { label: 'Moldy feed', value: 'Never feed moldy hay or grain.' },
      { label: 'Overfeeding concentrates', value: 'Too much hard feed causes colic and laminitis.' },
      { label: 'Sand or impaction', value: 'Feeding on sand and insufficient water raise colic risk.' }
    ]
  };

  var DEFAULT_STAGES = ['Young (under 1 year)', 'Adult (1-5 years)', 'Senior (5 years and up)'];
  var DEFAULT_BREEDS = [];

  function optionsFor(petType) {
    return (STAGES[petType] || DEFAULT_STAGES).slice();
  }

  function breedsFor(petType) {
    var list = (BREEDS[petType] || DEFAULT_BREEDS).slice();
    list.push(MIXED);
    return list;
  }

  function nounFor(petType) {
    return SPECIES_NOUN.indexOf(petType) > -1 ? 'Species' : 'Breed';
  }

  function placeholderFor(petType) {
    return nounFor(petType) === 'Species'
      ? 'e.g. Betta, Leopard gecko, Budgerigar'
      : 'e.g. Labrador Retriever, Maine Coon, Holland Lop';
  }

  function hazardsFor(petType) {
    return (HAZARDS[petType] || []).slice();
  }

  /* ------------------------------------------------------------- routines */

  // A routine is the daily checklist for one species. `role` lets the tracker
  // ask generic questions ("how many days fed?") without hard-coding a key per
  // species: the first `food` item counts as fed, the first `activity` item as
  // exercised. Everything else is just tracked and stored.
  var ROUTINES = {
    Dog: [
      { key: 'fed', label: 'Fed their meal', icon: '🍚', role: 'food' },
      { key: 'water', label: 'Fresh water available', icon: '💧', role: 'water' },
      { key: 'walk', label: 'Walk or exercise', icon: '🐕', role: 'activity' },
      { key: 'potty', label: 'Potty normal', icon: '🌿', role: 'potty' },
      { key: 'brush', label: 'Brushed / coat checked', icon: '🪮', role: 'hygiene' },
      { key: 'meds', label: 'Medication given', icon: '💊', role: 'health' }
    ],
    Cat: [
      { key: 'fed', label: 'Fed their meal', icon: '🍚', role: 'food' },
      { key: 'water', label: 'Fresh water available', icon: '💧', role: 'water' },
      { key: 'litter', label: 'Litter box used normally', icon: '🪣', role: 'potty' },
      { key: 'play', label: 'Play or exercise', icon: '🧶', role: 'activity' },
      { key: 'brush', label: 'Brushed / grooming', icon: '🪮', role: 'hygiene' },
      { key: 'meds', label: 'Medication given', icon: '💊', role: 'health' }
    ],
    Rabbit: [
      { key: 'hay', label: 'Unlimited hay available', icon: '🌾', role: 'food' },
      { key: 'water', label: 'Fresh water available', icon: '💧', role: 'water' },
      { key: 'veg', label: 'Fresh veg given', icon: '🥬', role: 'portion' },
      { key: 'pellets', label: 'Measured pellets', icon: '🥣', role: 'portion' },
      { key: 'litter', label: 'Litter / spot clean', icon: '🧹', role: 'habitat' },
      { key: 'exercise', label: 'Exercise or free-roam', icon: '🏃', role: 'activity' }
    ],
    'Guinea Pig': [
      { key: 'hay', label: 'Hay available', icon: '🌾', role: 'food' },
      { key: 'water', label: 'Fresh water available', icon: '💧', role: 'water' },
      { key: 'veg', label: 'Fresh veg given', icon: '🥬', role: 'portion' },
      { key: 'pellets', label: 'Measured pellets', icon: '🥣', role: 'portion' },
      { key: 'cage', label: 'Cage spot-clean', icon: '🧹', role: 'habitat' },
      { key: 'exercise', label: 'Floor time or wheel', icon: '🏃', role: 'activity' }
    ],
    Hamster: [
      { key: 'food', label: 'Complete food given', icon: '🍚', role: 'food' },
      { key: 'water', label: 'Fresh water available', icon: '💧', role: 'water' },
      { key: 'veg', label: 'Fresh veg or treat', icon: '🥕', role: 'portion' },
      { key: 'bedding', label: 'Bedding changed', icon: '🧹', role: 'habitat' },
      { key: 'wheel', label: 'Wheel or exercise', icon: '🏃', role: 'activity' },
      { key: 'handling', label: 'Checked over / handled', icon: '🤲', role: 'health' }
    ],
    Bird: [
      { key: 'food', label: 'Fresh food and pellets', icon: '🌾', role: 'food' },
      { key: 'water', label: 'Fresh water available', icon: '💧', role: 'water' },
      { key: 'veg', label: 'Fresh veg and fruit', icon: '🥬', role: 'portion' },
      { key: 'forage', label: 'Foraging or shredding', icon: '🪶', role: 'activity' },
      { key: 'cage', label: 'Cage cleaned', icon: '🧹', role: 'habitat' },
      { key: 'handling', label: 'Out of cage / handled', icon: '🤲', role: 'health' }
    ],
    Fish: [
      { key: 'food', label: 'Small feeding given', icon: '🍚', role: 'food' },
      { key: 'water', label: 'Water change done', icon: '💧', role: 'water' },
      { key: 'filter', label: 'Filter checked or cleaned', icon: '⚙️', role: 'habitat' },
      { key: 'heater', label: 'Heater at temperature', icon: '🌡️', role: 'habitat' },
      { key: 'ammonia', label: 'Water tested (pH, ammonia)', icon: '🧪', role: 'health' },
      { key: 'behaviour', label: 'Observed behaviour', icon: '👀', role: 'health' }
    ],
    Reptile: [
      { key: 'food', label: 'Feeding or greens given', icon: '🥬', role: 'food' },
      { key: 'water', label: 'Fresh water / misted', icon: '💧', role: 'water' },
      { key: 'mist', label: 'Humidity or misting checked', icon: '💦', role: 'habitat' },
      { key: 'basking', label: 'Basking spot checked', icon: '☀️', role: 'habitat' },
      { key: 'shed', label: 'Shedding and skin checked', icon: '👀', role: 'health' },
      { key: 'handling', label: 'Enclosure and handling checked', icon: '🤲', role: 'health' }
    ],
    Horse: [
      { key: 'forage', label: 'Hay or forage given', icon: '🌾', role: 'food' },
      { key: 'water', label: 'Fresh water available', icon: '💧', role: 'water' },
      { key: 'turnout', label: 'Turnout or exercise', icon: '🐴', role: 'activity' },
      { key: 'muck', label: 'Mucked out and bedded', icon: '🧹', role: 'habitat' },
      { key: 'groom', label: 'Groomed / hooves checked', icon: '🪮', role: 'hygiene' },
      { key: 'meds', label: 'Medication or supplements', icon: '💊', role: 'health' }
    ]
  };

  // Fallback keeps the tracker usable if a species ever gains breeds before its
  // routine is written, rather than rendering an empty checklist.
  var DEFAULT_ROUTINE = ROUTINES.Dog;

  function types() {
    return Object.keys(BREEDS);
  }

  function routineFor(petType) {
    var list = ROUTINES[petType] || DEFAULT_ROUTINE;
    return list.map(function (item) {
      return { key: item.key, label: item.label, icon: item.icon, role: item.role };
    });
  }

  // The checklist key that answers "were they fed?" for a species.
  function foodKeyFor(petType) {
    var list = ROUTINES[petType] || DEFAULT_ROUTINE;
    for (var i = 0; i < list.length; i++) {
      if (list[i].role === 'food') return list[i].key;
    }
    return list[0].key;
  }

  function activityKeyFor(petType) {
    var list = ROUTINES[petType] || DEFAULT_ROUTINE;
    for (var i = 0; i < list.length; i++) {
      if (list[i].role === 'activity') return list[i].key;
    }
    return '';
  }

  // Species that have no meaningful exercise field get a blank one.
  function measuresActivity(petType) {
    return activityKeyFor(petType) !== '';
  }

  /* ----------------------------------------------------------------- diet */

  var DIET_NOTES = {
    Dog: 'Complete dog food measured by the cup. Keep treats under about a tenth of their daily calories.',
    Cat: 'Complete cat food in measured meals. Wet food adds welcome water for cats that drink little.',
    Rabbit: 'Unlimited grass hay is the staple, fresh veg daily. Pellets are a supplement, not the main meal.',
    'Guinea Pig': 'Grass hay, fresh veg daily, and a small portion of plain guinea-pig pellets. Avoid muesli mixes.',
    Hamster: 'Complete hamster food, small amounts of fresh veg, and an occasional mealworm for protein.',
    Bird: 'A quality pellet as the base, fresh veg and a little fruit, plus time to forage rather than always eating from a bowl.',
    Fish: 'Small flake or pellet portions two or three times a day. Overfeeding is the usual cause of fouled water.',
    Reptile: 'Species-appropriate diet. Many need fresh greens plus a calcium supplement; insectivores need appropriately sized feeder insects.',
    Horse: 'Forage such as grass or hay for most of the day, with a balanced ration on top. Never withhold hay.'
  };

  function dietNote(petType, stage) {
    var note = DIET_NOTES[petType] || DIET_NOTES.Dog;
    if (/senior|older/i.test(stage || '')) {
      note += ' Older pets often need slightly fewer calories but the same protein, so keep the food the same and cut portions.';
    } else if (/young|under|puppy|kitten|baby/i.test(stage || '')) {
      note += ' Young ones need frequent small meals rather than one large portion.';
    }
    return note;
  }

  global.PetData = {
    MIXED: MIXED,
    types: types,
    stages: optionsFor,
    breeds: breedsFor,
    noun: nounFor,
    placeholder: placeholderFor,
    hazards: hazardsFor,
    routine: routineFor,
    foodKey: foodKeyFor,
    activityKey: activityKeyFor,
    measuresActivity: measuresActivity,
    dietNote: dietNote,
    STAGES: STAGES,
    BREEDS: BREEDS,
    HAZARDS: HAZARDS,
    ROUTINES: ROUTINES,
    DIET_NOTES: DIET_NOTES
  };
})(window);